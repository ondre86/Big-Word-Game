// I chose a mondo file because we can just use Ctrl+C. Assuming we don't need any interfaces asides the CLI and HTTP API
require('dotenv').config()
const express = require('express')
const helmet = require('helmet')
const syl = require('syllabificate')
const server = express()
const readline = require('readline-sync')
const yargs = require('yargs')
const pg = require('pg')
const { Pool } = pg
const GameInstance = require('./game/index.js')
const env = require('./env/index.js')
const fs = require("node:fs")
const { prompt } = require("enquirer")
// const clear = require('clear')
// const clui = require('clui')
// const clc = require('clc')
// const Line = clui.Line
const http = require('node:http')

require('express-ws')(server)
server.use(express.static('public'))
server.use(express.json())
server.use(helmet())
server.disable('x-powered-by')

let data;
/* Backwards Compatability*/
server.post('/', async (req, res) => {
    if(!req.body){
        return res.status(400).send({ status: 'failed' })
    }
    await dictionaryCall(req.body.input)

    res.status(200).send({ 
        data: data,
        tps: syl.countSyllables(req.body.input)
    })
})

server.get("/", (req, res) => {
    res.status(200).send()
})

async function dictionaryCall(input/*string*/){
    try{
        let dictURL = `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${input}?key=${process.env.BWG_API_KEY}`
        const response = await fetch(dictURL)
        if (!response.ok){
            throw new Error("Could not fetch resource")
        }
        data = await response.json()
    }
    catch(e){
        console.error(e)
    }
}
/*Begin New Engine*/

const ERR_LOBBY_UNAUTHORIZED = new Error("unauthorized")
const ERR_LOBBY_USERNAME_EXISTS = new Error("username exists")
const ERR_LOBBY_SHORTNAME_EXISTS = new Error("gameroom name exists")
const ERR_LOBBY_CREDENTIALS_INCORRECT = new Error("name or password is incorrect please try again")
const ERR_LOBBY_NOT_FOUND = new Error("not found")

/*Lets maybe only have client interact with the db right now as a singleton*/
class Lobby {
    constructor(client){
        this.db = client;
        this.id;
        this.players = [];
        this.playersByUsername = {};
        this.playersById = {};
        this.playersByGameRoomId = {};
        this.gameRooms = [];
        this.gameRoomsById = {};
        this.gameRoomsByShortName = {};
    }
    async Sync(){
        try{
            const data = await this.db.query("SELECT id FROM lobby LIMIT 1")
            this.id = data.rows[0].id
            await this.db.query("DELETE FROM gameRoom WHERE NOW() >= expiresAt")
            await this.db.query("DELETE FROM playerSessionToken WHERE NOW() >= expiresAt")

            const players = await this.db.query("SELECT id, username, password FROM player")
            this.players = []
            for(const row of players.rows){
                const p = new Player(row.id, row.username, row.password)
                this.players.push(p)
                this.playersByUsername[p.username] = p
                this.playersById[p.id] = p
            }
            const gameRooms = await this.db.query("SELECT id, ownerPlayerId, shortName, selectedGameId, password, players, playersReady, createdAt, expiresAt FROM gameRoom")
            this.gameRooms = []
            this.gameRoomsByShortName = {}
            this.gameRoomsById = {}
            this.playersByGameRoomId = {}
            for(const row of gameRooms.rows){
                const g = new GameRoom(row.id, row.ownerplayerid, row.shortname, row.password)
                g.selectedGameId = row.selectedgameid
                g.players = JSON.parse(row.players)
                g.playersReady = JSON.parse(row.playersready)
                g.createdAt = row.createdat
                g.closesAt = row.expiresat
                for(const p of g.players) {
                    g.playersById[p.id] = p
                }
                this.gameRooms.push(g)
                this.gameRoomsByShortName[g.shortName] = g
                this.gameRoomsById[g.id] = g
                for(const grp of g.players) {
                    this.playersByGameRoomId[grp.id] = g.id
                }
            }
        } catch (e) {
            throw e
        }
        return
    }
    async Register(username, password) {
        if (this.playersByUsername[username] != undefined) {
            throw ERR_LOBBY_USERNAME_EXISTS
        }
        let idx = this.players.length
        let p = new Player(idx, username, password/*Dangerous, must encrypt*/)
        try {
            const usernameCheck = await this.db.query("SELECT count(username) > 0 as hasUsername FROM player")
            if (usernameCheck.rows[0].hasUsername) { throw ERR_LOBBY_USERNAME_EXISTS }
            await this.db.query("INSERT INTO player (id, username, password) VALUES ($1, $2, $3)", [idx, username, password])
            this.players.push(p)
            this.playersByUsername[username] = this.players[idx]
            this.playersById[p.id] = this.players[idx]
            console.log(`Player ${username} has registered for the lobby`)
        } catch (e) {
            throw e
        }
        return
    }
    async Login(username, password) {
        if (this.playersByUsername[username] == undefined) {
            throw ERR_LOBBY_CREDENTIALS_INCORRECT
        }
        if (this.playersByUsername[username].password == password) {
            try {
                const token = this.playersByUsername[username].Encode()
                await this.db.query("DELETE FROM playerSessionToken WHERE playerId = $1", [this.playersByUsername[username].id])
                await this.db.query("INSERT INTO playerSessionToken (token, playerId, createdAt, expiresAt) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + (20 * interval '1 minute'))", [token, this.playersByUsername[username].id])
                console.log(`Player ${username} has received token valid for 20 minutes`)
                return token
            } catch (e) {
                throw e
            }
        } else {
            throw ERR_LOBBY_CREDENTIALS_INCORRECT
        }
    }
    async NewGameRoom(playerid, shortName, password) {
        if(this.gameRoomsByShortName[shortName] != undefined){
            throw ERR_LOBBY_SHORTNAME_EXISTS
        }
        let idx = this.gameRooms.length
        const g = new GameRoom(idx, playerid, shortName, password)
        try {
            const gr = await this.db.query("SELECT * FROM gameRoom WHERE shortName = $1", [shortName])
            if (gr.rows.length > 0){
                throw ERR_LOBBY_SHORTNAME_EXISTS
            }
            await this.db.query("INSERT INTO gameRoom (id, ownerPlayerId, shortName, password, createdAt, expiresAt) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + (interval '1 hour'))", [g.id, g.gameRoomOwnerPlayerId, g.shortName, g.password])
            this.gameRooms.push(g)
            this.gameRoomsById[g.id] = g
            this.gameRoomsByShortName[g.shortName] = g
            console.log(`Player ${this.playersById[playerid].username} has created a game room`)
        } catch (e) {
            throw e
        }
        return g
    }
    async FindPlayerByAuthToken(token){
        try {
            const playerSessionToken = await this.db.query("SELECT token, playerId, NOW() >= expiresAt as expired FROM playerSessionToken WHERE token = $1", [token])
            if (playerSessionToken.rows.length == 0) {
                throw ERR_INVALID_AUTHENTICATION
            }
            const { _, playerid, expired } = playerSessionToken.rows[0]
            if (expired) {
                throw ERR_INVALID_AUTHENTICATION
            }
            const p = this.playersById[playerid]
            return p
        } catch (e) {
            throw e
        }
    }
    async JoinGameRoom(playerid, gameroomid, password, sendFn) {
        if(this.gameRoomsById[gameroomid] == undefined) {
            throw ERR_LOBBY_NOT_FOUND
        }
        const g = this.gameRooms[gameroomid]
        if (g.password && g.password != password) {
            throw ERR_LOBBY_CREDENTIALS_INCORRECT
        }
        if(this.playersById[playerid] == undefined) {
            throw ERR_LOBBY_NOT_FOUND
        }
        if(this.playersById[playerid] == undefined){
            throw ERR_LOBBY_NOT_FOUND
        }
        if(this.playersByGameRoomId[playerid] != undefined) {
            throw ERR_PLAYER_IN_GAMEROOM
        }
        g.Join(this.playersById[playerid], password, sendFn)
        this.gameRooms[g.id] = g
        this.gameRoomsByShortName[g.shortName] = g
        this.gameRoomsById[g.id] = g
        this.playersByGameRoomId[playerid] = g.id
        await this.db.query("UPDATE gameRoom SET players = $1 WHERE id = $2", [JSON.stringify(g.players), g.id])
        console.log(`Player ${this.playersById[playerid].username} has joined the gameroom`)
        for(const s of g.socketByPlayerId) {
            s(`Player ${player.username} has joined the gameroom`)
        }
    }
    async MakeGameRoomOwner(gameroomid, playerid) {
        if (this.gameRooms[gameroomid] == undefined) {
            throw ERR_GAMEROOM_NOT_FOUND
        }
        await this.gameRooms[gameroomid].MakeGameRoomOwner(playerid)
        console.log(`Player ${this.playersById[playerid].username} owns gameroom ${this.gameRooms[gameroomid].shortName}`)
        for(const s of this.gameRooms[gameroomid].socketByPlayerId) {
            s(`Player ${p.username} is game room owner`)
        }
    }
    async PlayerReady(gameroomid, playerid, isReady) {
        if (this.gameRooms[gameroomid] == undefined) {
            throw ERR_GAMEROOM_NOT_FOUND
        }
        await this.gameRooms[gameroomid].PlayerReady(playerid, isReady)
        console.log(`Player ${this.players[playerid].username} is ${ready?``:`not`} ready in gameroom ${this.gameRooms[gameroomid].shortName}`)
        for(const s of this.gameRooms[gameroomid].socketByPlayerId) {
            s(`Player ${p.username} is ${ready?``:`not`} ready`)
        }
    }
    async SelectGame(gameroomid, gameidx) {
        if(this.gameRoomsById[gameroomid] == undefined) {
            throw ERR_LOBBY_NOT_FOUND
        }
        if(this.gameRoomsById[gameroomid].games.length < gameidx) {
            throw ERR_GAMEROOM_NOT_FOUND
        }
        const gr = this.gameRoomsById[gameroomid]
        await this.db.query("UPDATE gameRoom SET selectedGameId = $1, playersReady = '{}' WHERE id = $2", [gameidx, gameroomid])
        gr.selectedGameId = gameidx
        game = gr.games[gr.selectedGameId]
        gr.LoadGameInstance(game.Game.bind(this))
            .WithMaxPlayers(gr.GAME_MAX_PLAYERS)
            .WithPlayers()
        console.log(`Game ${game.GAME_NAME} selected in gameroom ${this.gameRooms[gameroomid].shortName}`)
        for(const s of gr.socketByPlayerId) {
            s(`Game ${game.GAME_NAME} selected`)
        }
        gr.playerReady = {}
        this.gameRooms[gr.id] = gr
        this.gameRoomsById[gr.id] = gr
        this.gameRoomsByShortName[gr.shortName] = gr
    }
    ListGameRooms() {
        return this.gameRooms
    }
    async StartGame(gameroomid){
        if(this.gameRooms[gameroomid] == undefined) {
            throw ERR_GAMEROOM_NOT_FOUND
        }
        const gr = this.gameRooms[gameroomid];
        await gr.Start()
        console.log(`Game started in gameroom ${gr.shortName}`)
        game = gr.games[gr.selectedGameId]
        for(const s of gr.socketByPlayerId) {
            s(`Game ${game.GAME_NAME} started`)
        }
    }
}

const ERR_GAMEROOM_NOT_FOUND = new Error("not found")
const ERR_GAMEROOM_UNAUTHORIZED = new Error("unauthorized")
const ERR_INVALID_AUTHENTICATION = new Error("the credentials provided are incorreact")
const ERR_GAMEROOM_FORBIDDEN = new Error("forbidden")
const ERR_GAMEROOM_NO_GAMES = new Error("no games loaded")
const ERR_GAMEROOM_NO_GAME_SELECTED = new Error("no game selected")

class GameRoom {
    constructor(id, playerId, shortName, password) {
        this.id = id
        this.shortName = shortName;
        this.password = password;
        this.games = [
            GameInstance.Single
        ];
        this.selectedGameId;
        this.players = [];
        this.playersById = {};
        this.playerReady = {};
        this.socketByPlayerId = {};
        this.gameRoomOwnerPlayerId = playerId;
        this.createdAt;
        this.closesAt;
    }
    Join(player, password, sendFn) {
        if (this.password && this.password != password) {
            throw ERR_INVALID_AUTHENTICATION;
        }
        this.players.push(player)
        this.playersById[player.id] = player
        this.socketByPlayerId[player.id] = sendFn
    }
    PlayerReady(playerid, isReady) {
        if(this.players[playerid] == undefined){
            throw ERR_PLAYER_NOT_FOUND
        }
        this.playerReady = isReady
    }
    MakeGameRoomOwner(playerid) {
        if(this.players[playerid] == undefined) {
            throw ERR_PLAYER_NOT_FOUND
        }
        this.gameRoomOwnerPlayerId = playerid
    }
    async Start() {
        if (this.games.length==0) {
            throw ERR_GAMEROOM_NO_GAMES
        }
        if (this.games[this.selectedGameId]==undefined){
            throw ERR_GAMEROOM_NO_GAME_SELECTED
        }
        if (await this.games[this.selectedGameId].AwaitAllLoaded()) {
            this.games[this.selectedGameId].BeginGame()
        } else {
            setTimeout(this.Start, 1000)
        }
    }
    AddGames(...games) {
        for(const game of games){
            this.games[this.games.length] = game
        }
    }
    String() {
        return JSON.stringify({
            id: this.id,
            shortName: this.shortName,
            password: !!this.password,
            games: this.games.map((i, g) => {return {"shortName": g.GAME_NAME, "description": g.GAME_DESCRIPTION, "id": i}})
        })
    }
}

const ERR_PLAYER_NOT_FOUND = new Error("not found")
const ERR_PLAYER_IN_GAMEROOM = new Error("already in gameroom")

class Player {
    constructor(id, username, password) {
        this.id = id
        this.username = username
        this.password = password
    }
    String(safe){
        return JSON.stringify({ "id": this.id, "username": this.username, "password": safe ? this.password : "" })
    }
    Encode(){
        return Buffer.from(this.String(), 'ascii').toString('base64')
    }
    Decode(playerinfo){
        let info = JSON.parse(Buffer.from(playerinfo, 'base64').toString('ascii'))
        this.id = info.id
        this.username = info.username
        this.password = info.password
        return info
    }
}

const ERR_MAX_PLAYERS_NOT_SET = new Error("max players undefined");
const ERR_MAX_PLAYERS_EXCEEDED = new Error("max players exceeded");
const ERR_NOT_IMPLEMENTED = new Error("not implemented")
const ERR_API_UNAVAILABLE = new Error("could not fetch resource")

class Game {
    constructor(id, shortName, description){
        this.id = id
        this.shortName = shortName
        this.description = description
        // interfaces
        this.awaitAllLoaded;
        this.beginGame;
        this.acceptAttempt;
        this.emitGameStats;
        this.endGame;
        this.rankPlayers;
        this.gameInstance;
    }
    LoadGameInstance(gameClass, ...args){
        this.gameInstance = new gameClass(args)
        this.WithAwaitAllLoaded(this.gameInstance.AwaitAllLoaded)
        this.WithBeginGame(this.gameInstance.BeginGame)
        this.WithAcceptAttempt(this.gameInstance.AcceptAttempt)
        this.WithEmitGameStats(this.gameInstance.EmitGameStats)
        this.WithEndGame(this.gameInstance.EndGame)
        this.WithRankPlayers(this.gameInstance.RankPlayers)
        return this
    }
    WithMaxPlayers(maxPlayers){
        if(maxPlayers){
            this.maxPlayers = maxPlayers
        } else {
            throw ERR_MAX_PLAYERS_NOT_SET
        }
        return this
    }
    MaxPlayers(){
        if(this.maxPlayers == undefined){
            throw ERR_MAX_PLAYERS_NOT_SET
        }
        return this.maxPlayers
    }
    WithPlayers() {
        try {
            if (this.maxPlayers < this.players){
                throw ERR_MAX_PLAYERS_EXCEEDED
            }
        } catch (ERR_MAX_PLAYERS_NOT_SET) {}

        return this
    }
    Players() {
        return this.players
    }
    WithAwaitAllLoaded(fn) {
        if (fn != undefined){
            this.awaitAllLoaded = fn.bind(this)
        }
        return this
    }
    async AwaitAllLoaded() {
        if (this.awaitAllLoaded == undefined) { throw ERR_NOT_IMPLEMENTED }
        return await this.awaitAllLoaded()
    }
    WithBeginGame(fn) {
        if (fn != undefined){
            this.beginGame = fn.bind(this)
        }
        return this
    }
    BeginGame() {
        if (this.beginGame == undefined) { throw ERR_NOT_IMPLEMENTED }
        return this.beginGame()
    }
    WithAcceptAttempt(fn) {
        if (fn != undefined){
            this.acceptAttempt = fn.bind(this)
        }
        return this
    }
    AcceptAttempt() {
        if (this.acceptAttempt == undefined) { throw ERR_NOT_IMPLEMENTED }
        return this.acceptAttempt()
    }
    WithEmitGameStats(fn) {
        if (fn != undefined){
            this.emitGameStats = fn.bind(this)
        }
        return this
    }
    EmitGameStats() {
        if (this.emitGameStats == undefined) { throw ERR_NOT_IMPLEMENTED }
        return this.emitGameStats
    }
    WithEndGame(fn) {
        if (fn != undefined){
            this.endGame = fn.bind(this)
        }
    }
    EndGame() {
        if (this.endGame == undefined) { throw ERR_NOT_IMPLEMENTED }
        return this.endGame()
    }
    WithRankPlayers(fn) {
        if (fn != undefined){
            this.rankPlayers = fn.bind(this)
        }
        return this
    }
    RankPlayers() {
        if (this.rankPlayers == undefined) { throw ERR_NOT_IMPLEMENTED}
        return this.rankPlayers()
    }
}

// After defining classes lets start up our lobby instance on this server.

// Our Database Connection Driven From the DB
const pool = new Pool()
const lobby = new Lobby(pool)
const clientOptions = {
    hostname: 'localhost',
    port: env.CLIPORT,
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': (data) => Buffer.byteLength(JSON.stringify(data))
    }
}
const promised = lobby.Sync()
setInterval(async () => {
    await lobby.Sync()
}, 5 /*seconds*/ * 1000)

const CMD_AUTH_FILE = "_session.bwg" /*maybe an encrypted file?*/

let cmd  = yargs(process.argv.slice(2))

cmd = cmd.command({
    command: "*",
    desc: 'catch all',
    handler: async (argv) => {
        console.log("Welcome to the Big Word Game! Please add [--help] for more")
        process.exit()
    }
})

server.post("/open/register", async (req, res) => {
    const { username, password } = req.body
    try {
        await lobby.Register(username, password)
    } catch (e) {
        res.status(400).write(e.toString())
        return
    }
    res.status(200).send()
    return
})

cmd = cmd.command({
    command: "register",
    desc: 'register user into lobby',
    handler: async (argv) => {
        var username = readline.question('username: ');
        var password = readline.question('password: ', {
            hideEchoBack: true,
        })
        try {
            const data = JSON.stringify({username, password})
            const req = http.request({
                hostname: 'localhost',
                path: '/open/register',
                port: env.PORT,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                },
            }, (res) => {
                console.log(res.statusCode == 200 ? 'OK' : 'Failed')
                process.exit(res.statusCode == 200 ? 0 : 1)
            })
            req.on('error', (e) => {
                throw e
            })
            req.write(data)
            req.end()
        } catch (e) {
            console.log(e.toString())
            process.exit(1)
        }

    }
})



cmd = cmd.command({
    command: "login",
    desc: 'log user into lobby',
    handler: async (argv) => {
        var username = readline.question('username: ');
        var password = readline.question('password: ', {
            hideEchoBack: true,
        })
        try {
            const token = await lobby.Login(username, password)
            fs.writeFileSync(CMD_AUTH_FILE, token)
            const p = await lobby.FindPlayerByAuthToken(token)
            console.log(`Welcome ${p.username}!`)
            process.exit(0)
        } catch (e) {
            console.log(e.toString())
            process.exit(1)
        }

    }
})

server.post("/open/login", async (req, res) => {
    const { username, password } = req.body
    try {
        const token = await lobby.Login(username, password)
        res.status(200).send(token)
        return
    } catch (e) {
        res.status(400).write(e.toString())
        return
    }
})

cmd = cmd.command({
    command: "who-am-i",
    desc: 'describe username',
    handler: async (argv) => {
        try {
            const token = fs.readFileSync(CMD_AUTH_FILE, { encoding: 'utf8' })
            if(token=="") {
                throw ERR_LOBBY_UNAUTHORIZED
            }
            const p = await lobby.FindPlayerByAuthToken(token)
            console.log("Welcome", p.username, "!")
            process.exit(0)
        } catch (e) {
            console.log(e.toString())
            process.exit(1)
        }
    }
})

cmd = cmd.command({
    command: "new-game-room <shortName> [password]",
    desc: 'create a new game room within lobby',
    handler: async (argv) => {
        try {
            const token = fs.readFileSync(CMD_AUTH_FILE, { encoding: 'utf8' })
            if(token=="") {
                throw ERR_LOBBY_UNAUTHORIZED
            }
            const p = await lobby.FindPlayerByAuthToken(token)
            const g = await lobby.NewGameRoom(p.id, argv.shortName, argv.password)
            await lobby.JoinGameRoom(p.id, g.id, argv.password)
            console.log(`Welcome to gameroom#${g.id}, ${g.shortName}!`)
            process.exit(0)
        } catch (e) {
            switch (e.code) {
                case "ENOENT":
                    console.log(ERR_LOBBY_UNAUTHORIZED)
                    break
                default:
                    console.log(e.toString())
                    break
            }
            process.exit(1)
        }
    }
})

server.post("/secure/new-game-room", async (req, res) => {
    const token = req.get("Authorization")
    if(token==""){
        res.set('WWW-Authenticate','Bearer')
        res.status(401).write(ERR_LOBBY_UNAUTHORIZED)
    }
    const { shortName, password } = req.body
    
    try {
        const p = await lobby.FindPlayerByAuthToken(token)
        const g = await lobby.NewGameRoom(p.id, shortName, password)
        await lobby.JoinGameRoom(p.id, g.id, password)
    } catch (e) {
        res.status(400).write(e.toString())
        return
    }
    res.status(200).send()
    return
})

cmd = cmd.command({
    command: "list-game-rooms",
    desc: 'list game rooms within lobby',
    handler: async (argv) => {
        try {
            const token = fs.readFileSync(CMD_AUTH_FILE, { encoding: 'utf8' })
            if(token=="") {
                throw ERR_LOBBY_UNAUTHORIZED
            }
            await lobby.FindPlayerByAuthToken(token)

            console.log(JSON.stringify(lobby.ListGameRooms()))
            process.exit(0)
        } catch (e) {
            switch (e.code) {
                case 'ENOENT':
                    console.log(ERR_LOBBY_UNAUTHORIZED)
                    break
                default:
                    console.log(e.toString())
                    break
            }
            process.exit(1)
        }
    }
})

server.get("/secure/list-game-rooms", (req, res) => {
    const token = req.get("Authorization")
    if(token=""){
        res.set('WWW-Authenticate', 'Bearer')
        res.status(401).write(ERR_LOBBY_UNAUTHORIZED)
    }
    
    res.status(200).send(JSON.stringify(lobby.ListGameRooms()))
})

cmd = cmd.command({
    command: "join-game-room <id> [password]",
    desc: 'join a game room within lobby',
    handler: async (argv) => {
        try {
            const token = fs.readFileSync(CMD_AUTH_FILE, { encoding: 'utf8' })
            if(token=="") {
                console.log(ERR_LOBBY_UNAUTHORIZED)
                process.exit(1)
            }
            const p = await lobby.FindPlayerByAuthToken(token)
            if(!lobby.gameRoomsByShortName[argv.id]) {
                console.log(ERR_GAMEROOM_NOT_FOUND)
                process.exit(1)
            }
            const g = lobby.gameRoomsByShortName[argv.id]
            await lobby.JoinGameRoom(p.id, g.id, argv.password, console.log)
            console.log(`Welcome to gameroom#${lobby.gameRooms[g.id].id}, ${lobby.gameRooms[g.id].playersById[p.id].username}!`)
            process.exit(0)
        } catch (e) {
            switch (e.code) {
                case 'ENOENT':
                    console.log(ERR_LOBBY_UNAUTHORIZED)
                    break
                default:
                    console.log(e.toString())
                    break
            }
            process.exit(1)
        }
    }
})

server.ws("/secure/join-game-room", async (ws, req) => {
    const token = req.get("Authorization")
    if(token=""){
        res.set("WWW-Authenticate", "Bearer")
        res.status(401).write(ERR_GAMEROOM_UNAUTHORIZED)
    }
    const { id, password } = req.body
    try {
        const p = await lobby.FindPlayerByAuthToken(token)
        if(!lobby.gameRooms[id]) {
            res.status(404).send(ERR_GAMEROOM_NOT_FOUND)
        }
        await lobby.JoinGameRoom(p.id, id, password, ws.send) 
    } catch (e) {
        res.status(400).send(e)
        return
    }
    res.status(200)
    return
})

server.post("/secure/make-game-room-owner", (req, res) => {
    const token = req.get("Authorization")
    if(token=""){
        res.set("WWW-Authenticate", "Bearer")
        res.status(401).write(ERR_GAMEROOM_UNAUTHORIZED)
    }
    try {
        const p = lobby.FindPlayerByAuthToken(token)
        if (lobby.gameRooms[id].gameRoomOwnerPlayerId != p.id) {
            throw ERR_GAMEROOM_FORBIDDEN
        }
        lobby.MakeGameRoomOwner(id, p.id)
    } catch (e) {
        res.status(400).send(e)
    }
    res.status(200)
    return
})

server.post("/secure/select-game", async (req, res) => {
    const token = req.get("Authorization")
    if(token=""){
        res.set("WWW-Authenticate", "Bearer")
        res.status(401).write(ERR_GAMEROOM_UNAUTHORIZED)
    }
    const { /*gameRoom*/id, gameidx } = req.body
    try {
        const p = await lobby.FindPlayerByAuthToken(token)
        if(!lobby.gameRooms[id]) {
            res.status(404).write(ERR_GAMEROOM_NOT_FOUND)
            return
        }
        if(lobby.ownerplayerid != p.id) {
            res.status(401).write(ERR_GAMEROOM_FORBIDDEN)
            return
        }
        if(lobby.gameRooms[id].games.length <= gameidx){
            res.status(404).write(ERR_GAMEROOM_NOT_FOUND)
            return
        }
        for(const i in lobby.gameRooms[id].games) {
            if (i == gameidx) {
                await lobby.SelectGame(id, gameidx)
                res.status(200)
                return
            }
        }
    } catch (e) {
        res.status(400).send(e)
        return
    }
    res.status(200)
    return
})

cmd = cmd.command({
    command: "select-game",
    desc: 'if game owner, selects the game to play in this room',
    handler: async (argv) => {
        try {
            const token = fs.readFileSync(CMD_AUTH_FILE, { encoding: 'utf8' })
            if(token=="") {
                console.log(ERR_LOBBY_UNAUTHORIZED)
                process.exit(1)
            }
            const p = await lobby.FindPlayerByAuthToken(token)
            const gr = lobby.gameRooms.find((g) => { return g.gameRoomOwnerPlayerId == p.id })
            if(!gr || !lobby.gameRooms[gr.id]) {
                console.log(ERR_GAMEROOM_NOT_FOUND)
                process.exit(1)
            }
            const response = await prompt({
                type: 'select',
                name: 'value',
                message: 'Please Choose a Game:',
                choices: lobby.gameRooms[gr.id].games.map((v, i) => {return {
                    "message": `${v.GAME_NAME}: ${v.GAME_DESCRIPTION}`,
                    "name": v.GAME_NAME,
                    "value": i
                }})
            })
            for(const gameidx in gr.games) {
                if (gr.games[gameidx].GAME_NAME == response.value) {
                    await lobby.SelectGame(gr.id, gameidx)
                    process.exit(0)
                }
            }
            process.exit(0)
        } catch (e) {
            switch (e.code) {
                case 'ENOENT':
                    console.log(ERR_GAMEROOM_UNAUTHORIZED)
                    break
                default:
                    console.log(e.toString())
                    break
            }
            process.exit(1)
        }
    }
})

cmd = cmd.command({
    command: "player-ready",
    desc: 'marks yourself as ready to participate in lobby game',
    handler: async (argv) => {
        try {
            const token = fs.readFileSync(CMD_AUTH_FILE, { encoding: 'utf8' })
            if(token=="") {
                console.log(ERR_LOBBY_UNAUTHORIZED)
                process.exit(1)
            }
            const p = await lobby.FindPlayerByAuthToken(token)
            if (lobby.playersByGameRoomId[p.id] == undefined) {
                throw ERR_GAMEROOM_NOT_FOUND
            }
            const g = lobby.playersByGameRoomId[p.id]
            await lobby.PlayerReady(g.id, p.id, argv.ready)
            process.exit(0)
        } catch (e) {
            switch (e.code) {
                case 'ENOENT':
                    console.log(ERR_GAMEROOM_UNAUTHORIZED)
                    break
                default:
                    console.log(e.toString())
                    break
            }
            process.exit(1)
        }
    }
})

server.post("/secure/player-ready", async (req, res) => {
    const token = req.get("Authorization")
    if(token=""){
        res.set("WWW-Authenticate", "Bearer")
        res.status(401).write(ERR_GAMEROOM_UNAUTHORIZED)
    }
    const { ready } = req.body
    try {
        const p = await lobby.FindPlayerByAuthToken(token)
        if (lobby.playersByGameRoomId[p.id] == undefined) {
            throw ERR_GAMEROOM_NOT_FOUND
        }
        const g = lobby.playersByGameRoomId[p.id]
        await lobby.PlayerReady(g.id, p.id, ready)
    } catch (e) {
        res.status(400).send(e)
        return
    }
    res.status(200)
    return
})

cmd = cmd.command({
    command: "start",
    desc: 'if game owner, will start the game once all players are marked ready',
    handler: async (argv) => {
        try {
            const token = fs.readFileSync(CMD_AUTH_FILE, { encoding: 'utf8' })
            if(token=="") {
                console.log(ERR_LOBBY_UNAUTHORIZED)
                process.exit(1)
            }
            const p = await lobby.FindPlayerByAuthToken(token)
            if (lobby.playersByGameRoomId[p.id] == undefined) {
                throw ERR_GAMEROOM_NOT_FOUND
            }
            const g = lobby.playersByGameRoomId[p.id]
            if (g.gameRoomOwnerPlayerId != p.id) {
                throw ERR_GAMEROOM_FORBIDDEN
            }
            await lobby.StartGame(g.id)
            process.exit(0)
        } catch (e) {
            switch (e.code) {
                case 'ENOENT':
                    console.log(ERR_GAMEROOM_UNAUTHORIZED)
                    break
                default:
                    console.log(e.toString())
                    break
            }
            process.exit(1)
        }
    }
})


server.post("/secure/start", async (req, res) => {
    const token = req.get("Authorization")
    if(token=""){
        res.set("WWW-Authenticate", "Bearer")
        res.status(401).write(ERR_GAMEROOM_UNAUTHORIZED)
    }
    try {
        const p = await lobby.FindPlayerByAuthToken(token)
        if (lobby.playersByGameRoomId[p.id] == undefined) {
            throw ERR_GAMEROOM_NOT_FOUND
        }
        const g = lobby.playersByGameRoomId[p.id]
        if (g.gameRoomOwnerPlayerId != p.id) {
            throw ERR_GAMEROOM_FORBIDDEN
        }
        await lobby.StartGame(g.id)
    } catch (e) {
        res.status(400).send(e)
        return
    }
    res.status(200)
    return
})

server.use((req, res, next) => {
    res.status(404).sendFile('404.html', {root: 'public'})
})
  
server.use((err, req, res, next) => {
    res.status(500).send(err.stack)
})

promised.then(() => {
    if(env.CLI) {
        cmd.parse()
    }
    if(env.SERVER) {
        server.listen(env.PORT, () => {
            console.log("lobby server started")
        })
    }
}).catch((e) => {
    console.log(e);
    process.exit(1);
})




