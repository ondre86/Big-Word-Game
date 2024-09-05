// I chose a mondo file because we can just use Ctrl+C. First we have classes, then we let the person running the script pick if
// they want to start a server, or a cli client based on ENV variables. From there we either setup a server listening on a specific port
// or we setup a client listing to a server defined in ENV variables.
require('dotenv').config()
const GameInstance = require('./game/index.js')
const env = require('./env/index.js')
const fs = require('node:fs/promises')
const http = require('node:http')
var consts = require('constants');
const WebSocket = require('ws');


const LOBBY_IDENTIFIER = 0
const USER_IDENTIFIER = 1
const GAME_ROOM_IDENTIFIER = 2
const GAME_INFORMATION = 3
const CURRENT_ACTION_ITEM = 4
const ANNOUNCEMENTS = 5

const ERR_LOBBY_UNAUTHORIZED = new Error("unauthorized")
const ERR_LOBBY_USERNAME_EXISTS = new Error("username exists")
const ERR_LOBBY_SHORTNAME_EXISTS = new Error("gameroom name exists")
const ERR_LOBBY_CREDENTIALS_INCORRECT = new Error("name or password is incorrect please try again")
const ERR_LOBBY_NOT_FOUND = new Error("not found")

/*Lets maybe only have the lobby running on the server and interact with the db right now as a singleton*/
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
        this.socketByPlayerId = {};
    }
    async Sync(){
        console.log('sync')
        try{
            const data = await this.db.query("SELECT id FROM lobby LIMIT 1")
            this.id = data.rows[0].id
            console.log(`Begin sync for lobby #${this.id}`)
            const gameRoomsDeleted = await this.db.query("DELETE FROM gameRoom WHERE NOW() >= expiresAt")
            const playerSessionTokensDeleted = await this.db.query("DELETE FROM playerSessionToken WHERE NOW() >= expiresAt")
            console.log(`Clean up expired entities`)
            console.log(`gameRoom(s)=${gameRoomsDeleted.rowCount} and playerSessionToken(s)=${playerSessionTokensDeleted.rowCount}.`)
            const players = await this.db.query("SELECT id, username, password FROM player")
            console.log(`Players registered=${players.rowCount}`)
            this.players = []
            for(const row of players.rows){
                const p = new Player(row.id, row.username, row.password)
                console.log(`Caching Player(${p.id}, ${p.username})`)
                this.players.push(p)
                this.playersByUsername[p.username] = p
                this.playersById[p.id] = p
            }
            const gameRooms = await this.db.query("SELECT id, ownerPlayerId, shortName, selectedGameId, password, players, playersReady, createdAt, expiresAt FROM gameRoom")
            console.log(`Select active GameRoom(s)=${gameRooms.rowCount}`)
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
                console.log(`Caching GameRoom(${g.id}, ${g.gameRoomOwnerPlayerId}, ${g.shortName}, ${g.players})`)
                for(const p of g.players) {
                    g.playersById[p.id] = p
                    console.log(`GameRoom Player(s)(${p.id},${p.username})`)
                }
                this.gameRooms.push(g)
                this.gameRoomsByShortName[g.shortName] = g
                this.gameRoomsById[g.id] = g
                for(const grp of g.players) {
                    this.playersByGameRoomId[grp.id] = g.id
                }
            }
            
            Object.values(this.socketByPlayerId)
                .forEach((socket) => socket?.send(`${LOBBY_IDENTIFIER}${this.id}`))
        } catch (e) {
            throw e
        }
        return
    }
    ToJson() {
        
    }
    static PathConnect = "/secure/connect"
    async Connect(playerid, socket){
        if (this.players[playerid] == undefined) {
            throw ERR_PLAYER_NOT_FOUND
        }
        socket?.send(`${USER_IDENTIFIER}${JSON.stringify(this.players[playerid].String(true))}`)
        this.socketByPlayerId[playerid] = socket
        Object.values(this.socketByPlayerId)
            .forEach((socket) => socket?.send(`${ANNOUNCEMENT}Welcome ${this.players[playerid].username}!`))
    }
    static PathRegister = "/open/register"
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
    static PathLogin = "/open/login"
    async Login(username, password) {
        if (this.playersByUsername[username] == undefined) {
            throw ERR_LOBBY_CREDENTIALS_INCORRECT
        }
        if (this.playersByUsername[username].password == password) { 
            try {
                const token = this.playersByUsername[username].Encode() /* To-do plz encrpyt */
                await this.db.query("DELETE FROM playerSessionToken WHERE playerId = $1", [this.playersByUsername[username].id])
                await this.db.query("INSERT INTO playerSessionToken (token, playerId, createdAt, expiresAt) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + (20 * interval '1 minute'))", [token, this.playersByUsername[username].id])
                console.log(`Player #${this.playersByUsername[username].id}, ${username} has received token valid for 20 minutes`)
                return token
            } catch (e) {
                throw e
            }
        } else {
            throw ERR_LOBBY_CREDENTIALS_INCORRECT
        }
    }
    static PathNewGameRoom = "/secure/new-game-room"
    async NewGameRoom(playerid, shortName, password) {
        if(this.gameRoomsByShortName[shortName] != undefined){
            throw ERR_LOBBY_SHORTNAME_EXISTS
        }
        if(this.playersByGameRoomId[playerid] != undefined) {
            throw ERR_PLAYER_IN_GAMEROOM
        }
        let idx = this.gameRooms.length
        const g = new GameRoom(idx, playerid, shortName, password)
        this.socketByPlayerId[g.gameRoomOwnerPlayerId]?.send(`${CURRENT_ACTION_ITEM}${Lobby.PathJoinGameRoom}`)
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
    static PathWhoAmI = "/secure/who-am-i"
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
    static PathJoinGameRoom = "/secure/join-game-room"
    async JoinGameRoom(playerid, gameroomid, password) {
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
        g.Join(this.playersById[playerid], password, this.socketByPlayerId[playerid])
        this.gameRooms[g.id] = g
        this.gameRoomsByShortName[g.shortName] = g
        this.gameRoomsById[g.id] = g
        this.playersByGameRoomId[playerid] = g.id
        await this.db.query("UPDATE gameRoom SET players = $1 WHERE id = $2", [JSON.stringify(g.players), g.id])
        console.log(`Player ${this.playersById[playerid].username} has joined the gameroom`)
        if (this.socketByPlayerId[playerid]) {
            this.socketByPlayerId[playerid]?.send(`${GAME_ROOM_IDENTIFIER}${g.id}`)

            if(g.gameRoomOwnerPlayerId == playerid && g.selectedGameId == undefined) {
                this.socketByPlayerId[playerid]?.send(`${CURRENT_ACTION_ITEM}${Lobby.PathSelectGame}`)
            }
        }

        Object.values(g.socketByPlayerId)
            .forEach((socket) => { socket.send(`${ANNOUNCEMENTS}Player ${this.playersById[playerid].username} has joined the gameroom`)})
    }
    static ExitGameRoom = "/secure/exit-game-room"
    async ExitGameRoom(gameroomid, playerid) {
        if (this.gameRooms[gameroomid] == undefined) {
            throw ERR_GAMEROOM_NOT_FOUND
        }
        const gr = this.gameRooms[gameroomid]
        if (gr.playersById[playerid] == undefined) {
            throw ERR_PLAYER_NOT_FOUND
        }
        await this.db.query("DELETE FROM players WHERE id = $1", [playerid])
        await this.db.query("UPDATE gameRoom SET players = $1 WHERE id = $2", [JSON.stringify(g.players), g.id])

        delete g.players[playerid]
        delete g.playersById[playerid]
        delete g.playerReady[playerid]
        delete g.socketByPlayerId[playerid]

    }
    static PathMakeGameRoomOwner = "/secure/make-game-room-owner"
    async MakeGameRoomOwner(gameroomid, playerid) {
        if (this.gameRooms[gameroomid] == undefined) {
            throw ERR_GAMEROOM_NOT_FOUND
        }
        await this.gameRooms[gameroomid].MakeGameRoomOwner(playerid)
        console.log(`Player ${this.playersById[playerid].username} owns gameroom ${this.gameRooms[gameroomid].shortName}`)
        if (this.socketByPlayerId[playerid]) {
            if(g.gameRoomOwnerPlayerId == playerid && g.selectedGameId == undefined) {
                this.socketByPlayerId[playerid]?.send(`${CURRENT_ACTION_ITEM}${Lobby.PathSelectGame}`)
            }
        }   
        Object.values(this.gameRooms[gameroomid].socketByPlayerId)
            .forEach((socket) => { socket?.send(`${ANNOUNCEMENTS}Player ${p.username} is game room owner`) })
    }
    static PathPlayerReady = "/secure/player-ready"
    async PlayerReady(gameroomid, playerid, isReady) {
        if (this.gameRooms[gameroomid] == undefined) {
            throw ERR_GAMEROOM_NOT_FOUND
        }
        const gr = this.gameRooms[gameroomid]
        const p = this.players[playerid]
        await gr.PlayerReady(playerid, isReady)
        console.log(`Player ${p.username} is ${ready?``:`not`} ready in gameroom ${gr.shortName}`)
        if (playerid == gr.gameRoomOwnerPlayerId && gr.socketByPlayerId[playerid]) {
            gr.socketByPlayerId[playerid]?.send(`${CURRENT_ACTION_ITEM}${Lobby.PathStartGame}`)
        }
        Object.values(gr.socketByPlayerId)
            .forEach((socket) => { socket?.send(`${ANNOUNCEMENTS}Player ${p.username} is ${ready?``:`not`} ready`)})

    }
    static PathSelectGame = "/secure/select-game"
    async SelectGame(gameroomid, gameidx) {
        console.log("Select Game", gameroomid, gameidx)
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
        Object.values(gr.socketByPlayerId)
            .forEach(function(socket) {
                socket?.send(`${CURRENT_ACTION_ITEM}${Lobby.PathPlayerReady}`)
                socket?.send(`${GAME_INFORMATION}${gr.EmitGameStats()}`)
                socket?.send(`${ANNOUNCEMENTS}Game ${game.GAME_NAME} selected`)
            })
        gr.playerReady = {}
        this.gameRooms[gr.id] = gr
        this.gameRoomsById[gr.id] = gr
        this.gameRoomsByShortName[gr.shortName] = gr
    }
    static PathListGameRooms = "/secure/list-game-rooms"
    ListGameRooms() {
        return this.gameRooms
    }
    static PathStartGame = "/secure/start-game"
    async StartGame(gameroomid){
        if(this.gameRooms[gameroomid] == undefined) {
            throw ERR_GAMEROOM_NOT_FOUND
        }
        const gr = this.gameRooms[gameroomid];
        if (gr.players.length != gr.playersReady.length) {
            for(const p of gr.players) {
                if (!gr.playerReady[p.id]) {
                    gr.socketByPlayerId[p.id]?.send(`${CURRENT_ACTION_ITEM}${Lobby.PathPlayerReady}`)
                }
                gr.socketByPlayerId[p.id]?.send(`${ANNOUNCEMENTS}Game ${game.GAME_NAME} is starting when all players are ready!`)
            }
        }
        await gr.AwaitAllLoaded()
        console.log(`Game starting in gameroom ${gr.shortName}`)
        game = gr.games[gr.selectedGameId]
        Object.values(gr.socketByPlayerId)
            .forEach(function(socket) {
                socket?.send(`${GAME_INFORMATION}${gr.EmitGameStats()}`)
                socket?.send(`${ANNOUNCEMENTS}Game ${game.GAME_NAME} started`)
            })
        await gr.Start()
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
    Join(player, password, s) {
        if (this.password && this.password != password) {
            throw ERR_INVALID_AUTHENTICATION;
        }
        this.players.push(player)
        this.playersById[player.id] = player
        this.socketByPlayerId[player.id] = s
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
        this.games[this.selectedGameId].BeginGame()
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
        return Buffer.from(this.String(), 'utf8').toString('base64')
    }
    Decode(playerinfo){
        let info = JSON.parse(Buffer.from(playerinfo, 'base64').toString('utf8'))
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
if (env.SERVER) {
    const express = require('express')
    const helmet = require('helmet')
    const syl = require('syllabificate')
    const server = express()

    const pg = require('pg')
    const { Pool } = pg
    require('express-ws')(server)
    server.use(express.static('public'))
    server.use(express.json())
    server.use(express.text())
    server.use(helmet())
    server.disable('x-powered-by')
    
    let bwg_data;
    /* Backwards Compatability*/
    server.post('/', async (req, res) => {
        if(!req.body){
            return res.status(400).send({ status: 'failed' })
        }
        await dictionaryCall(req.body.input)
    
        res.status(200).send({ 
            data: bwg_data,
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
            bwg_data = await response.json()
            return bwg_data
        }
        catch(e){
            console.error(e)
        }
    }

    server.post(Lobby.PathRegister, async (req, res) => {
        const { username, password } = req.body
        try {
            await lobby.Register(username, password)
            res.status(200).send()
            return
        } catch (e) {
            res.status(400).send(e.toString())
            return
        }
    })

    server.post(Lobby.PathLogin, async (req, res) => {
        const { username, password } = req.body
        try {
            const token = await lobby.Login(username, password)
            res.status(200).send(token)
            return
        } catch (e) {
            res.status(400).send(e.toString())
            return
        }
    })

    server.get(Lobby.PathWhoAmI, async (req, res) => {
        try {
            const token = req.get("Authorization")
            if(token==""){
                res.set('WWW-Authenticate','Bearer')
                res.status(401).send(ERR_LOBBY_UNAUTHORIZED)
                return
            }
            const p = await lobby.FindPlayerByAuthToken(token)
            res.set('Content-Type', 'application/json')
            res.status(200).send(p.String(true))
            return
        } catch (e) {
            res.status(400).send(e.toString())
            return
        }
    })

    server.post(Lobby.PathNewGameRoom, async (req, res) => {
        const token = req.get("Authorization")
        if(token==""){
            res.set('WWW-Authenticate','Bearer')
            res.status(401).send(ERR_LOBBY_UNAUTHORIZED)
            return
        }
        const { shortName, password } = req.body
        
        try {
            const p = await lobby.FindPlayerByAuthToken(token)
            await lobby.NewGameRoom(p.id, shortName, password)
        } catch (e) {
            res.status(400).send(e.toString())
            return
        }
        res.status(200).send()
        return
    })

    server.post(Lobby.PathJoinGameRoom, async (req, res) => {
        const token = req.get("Authorization")
        if(token==""){
            res.set("WWW-Authenticate", "Bearer")
            res.status(401).send(ERR_GAMEROOM_UNAUTHORIZED)
            return
        }
        const { id, password } = req.body
        try {
            const p = await lobby.FindPlayerByAuthToken(token)
            if(!lobby.gameRooms[id]) {
                res.status(404).send(ERR_GAMEROOM_NOT_FOUND)
                return
            }
            await lobby.JoinGameRoom(p.id, id, password) 
        } catch (e) {
            res.status(400).send(e)
            return
        }
        res.status(200)
        return
    })
    
    server.post(Lobby.PathMakeGameRoomOwner, (req, res) => {
        const token = req.get("Authorization")
        if(token==""){
            res.set("WWW-Authenticate", "Bearer")
            res.status(401).send(ERR_GAMEROOM_UNAUTHORIZED)
            return
        }
        try {
            const p = lobby.FindPlayerByAuthToken(token)
            if (lobby.gameRooms[id].gameRoomOwnerPlayerId != p.id) {
                throw ERR_GAMEROOM_FORBIDDEN
            }
            lobby.MakeGameRoomOwner(id, p.id)
        } catch (e) {
            res.status(400).send(e)
            return
        }
        res.status(200)
        return
    })
    
    server.post(Lobby.PathSelectGame, async (req, res) => {
        const token = req.get("Authorization")
        if(token==""){
            res.set("WWW-Authenticate", "Bearer")
            res.status(401).send(ERR_GAMEROOM_UNAUTHORIZED)
            return
        }
        const { /*gameRoom*/id, gameidx } = req.body
        try {
            const p = await lobby.FindPlayerByAuthToken(token)
            if(!lobby.gameRooms[id]) {
                res.status(404).send(ERR_GAMEROOM_NOT_FOUND)
                return
            }
            if(lobby.ownerplayerid != p.id) {
                res.status(401).send(ERR_GAMEROOM_FORBIDDEN)
                return
            }
            if(lobby.gameRooms[id].games.length <= gameidx){
                res.status(404).send(ERR_GAMEROOM_NOT_FOUND)
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

    server.post(Lobby.PathPlayerReady, async (req, res) => {
        const token = req.get("Authorization")
        if(token==""){
            res.set("WWW-Authenticate", "Bearer")
            res.status(401).send(ERR_GAMEROOM_UNAUTHORIZED)
            return
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

    server.get(Lobby.PathListGameRooms, (req, res) => {
        const token = req.get("Authorization")
        if(token==""){
            res.set('WWW-Authenticate', 'Bearer')
            res.status(401).send(ERR_LOBBY_UNAUTHORIZED)
            return
        }
        res.set('Content-Type', 'application/json')
        res.status(200).send(JSON.stringify(lobby.ListGameRooms()))
        return
    })

    server.post(Lobby.PathStartGame, async (req, res) => {
        const token = req.get("Authorization")
        if(token==""){
            res.set("WWW-Authenticate", "Bearer")
            res.status(401).send(ERR_GAMEROOM_UNAUTHORIZED)
            return
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

    server.ws(Lobby.PathConnect, async (ws, req) => {
        const token = req.get("Authorization")
        if(token==""){
            res.set("WWW-Authenticate", "Bearer")
            res.status(401).send(ERR_GAMEROOM_UNAUTHORIZED)
            return
        }
        try {
            const p = await _getPlayer()
            await lobby.Connect(p.id, ws)
        } catch (e) {
            ws.send(e.toString())
            return
        }
        ws.send("OK")
        return
    })
    
    server.get('*', (req, res) => {
        console.log(req.originalUrl)
        res.status(404);

        // respond with html page
        if (req.accepts('html')) {
          res.sendFile('404.html', {root: 'public'})
          return;
        }
      
        // respond with json
        if (req.accepts('json')) {
          res.json({ error: 'Not found' });
          return;
        }
      
        // default to plain-text. send()
        res.type('txt').send('Not found');
        return
    })
      
    server.use((err, req, res, next) => {
        res.status(500).send(err.stack)
        return
    })

    // After defining classes lets start up our lobby instance on this server.

    // Our Database Connection Driven From the DB
    const pool = new Pool()

    // instantiate the lobby with the database connection
    const lobby = new Lobby(pool)

    // Lets sync the lobby regularly
    setInterval(async () => {
        await lobby.Sync()
    }, 15 /*seconds*/ * 1000)

    // lets get the lobby instance up to date before we start the server
    promised = lobby.Sync()
    promised.then((res, reject) => {
        // start the server on env.PORT
        server.listen(env.PORT, () => {
            console.log("lobby server started")
        })
    })

}

const CMD_AUTH_FILE = "_session.bwg" /*maybe an encrypted file?*/

const ERR_REQUESTER_PATH_REQUIRED = "path required"
// The idea behind our cli client to to behave on feature parity with the front-end, so we want to utilize the same http api.

async function cliLobbyRequester(path="", payload=undefined, method="GET", contentType="text/plain"){
    return new Promise(async (resolve, reject) => {
        if (path == "") {
            reject(ERR_REQUESTER_PATH_REQUIRED)
        }
        let headers = {
            'Content-Type': contentType,
        }
        if (payload != undefined){
            headers['Content-Length'] = Buffer.byteLength(payload)
        }
        if (path.startsWith("/secure/")) {
            let file;
            let token;
            try {
                file = await fs.open(CMD_AUTH_FILE, 'r', consts.O_RDONLY)
                token = await file.readFile('utf8')
            } catch (e) {
                throw e
            } finally {
                await file?.close()
            }
            if(token=="") {
                reject(ERR_LOBBY_UNAUTHORIZED)
            }
            headers["Authorization"] = token
        }
        const req = http.request({
            hostname: env.HOST,
            path: path,
            method: method,
            port: env.PORT,
            headers: headers,
        }, (res) => {
            let data = '';
            let statusCode = res.statusCode
            let headers = res.headers
            res.setEncoding('utf8')
            res.on('data', (chunk) => {
                data += chunk
            })
            res.on('close', () => {
                if (res.headers['content-type'] && res.headers['content-type'].startsWith('application/json')){
                    data = JSON.parse(data)
                }
                if (statusCode == 200) {
                    resolve({ data, headers, statusCode})
                } else {
                    reject(data)
                }
            })
        })
        req.on('error', (e) => {
            reject(e)
            return
        })
        if (payload != undefined) {
            req.write(payload)
        }
        req.end()
    })
}

// If on the cli lets have a websocket singleton, we expect to establish a websocket connection afer we've registered and logged in
let _ws = undefined

async function _getWS() {
    if (_ws == undefined) {
        try {
            const url = `ws://${env.HOST}:${env.PORT}${Lobby.PathConnect}`
            _ws = new WebSocket(url)
            _ws.on('error', (e) => console.log(`Error=${e}`))
            _ws.on('open', function open() {
                _ws.send("OK")
            })
            _ws.on('message', function message(m) {
                console.log(`Message=${m}`)
            })
        } catch (e) {
            throw e
        }
    }
    return _ws
}

let _p = undefined
async function _getPlayer() {
    if (_p == undefined) {
        let file;
        let token;
        try {
            file = await fs.open(CMD_AUTH_FILE, 'r', consts.O_RDONLY)
            token = await file.readFile('utf8')
        } catch (e) {
            throw e
        } finally {
            await file?.close()
        }
        // token = Buffer.from(token, 'base64').toString('utf8') 
        if(token==""){
            throw ERR_LOBBY_UNAUTHORIZED
        }
        const p = await cliLobbyRequester(Lobby.PathWhoAmI, "", "GET")
        _p = p.data
    }
    return _p
}

let _g = undefined
async function _getGameRooms() {
    if (_g == undefined) {
        const g = await cliLobbyRequester(Lobby.PathListGameRooms, "", "GET")
        _g = g.data
    }
    return _g
}

const clear = require('clear');
const { prompt } = require("enquirer")
const CLI  = require("clui")
const {clc: clicolor} = require("cli-color")

function decorateGameRoom(ws) {
    // {0, 0} {user identifer} {x, 0} {lobby identifier}
    // {0, 1} {game room identifier}
    // {0, 2} {game information}
    // ...
    // {0, y} {current action item} {x, y} {user input}
    ws.on('message', (msg) => {
        console.log("ws received", msg)
        switch(msg){
            case msg.startsWith(USER_IDENTIFIER):
                break
            case msg.startsWith(LOBBY_IDENTIFIER):
                break
            case msg.startsWith(GAME_ROOM_IDENTIFIER):
                break 
            case msg.startsWith(GAME_INFORMATION):
                break
            case msg.startsWith(CURRENT_ACTION_ITEM):
                break
            default:
                break
        }
    })

    clear()

    new Line({
        x: 0,
        y: 0,
        width: 'console',
        height: 'console',
    }).column('Game Room # ')
}

if (env.CLI) {
    const readline = require('readline-sync')
    const yargs = require('yargs')

    let cmd  = yargs(process.argv.slice(2))

    cmd = cmd.command({
        command: "*",
        desc: 'catch all',
        handler: async () => {
            console.log("Welcome to the Big Word Game CLI!")
            console.log("Usage:")
            console.log("npm run cli -- --help")
            process.exit()
        }
    })

    cmd = cmd.command({
        command: "register",
        desc: 'register user into lobby',
        handler: async () => {
            var username = readline.question('username: ');
            var password = readline.question('password: ', {
                hideEchoBack: true,
            })
            const data = JSON.stringify({username, password})
            try {
                await cliLobbyRequester(Lobby.PathRegister, data, "POST", "application/json")
                process.exit(0)
            } catch (e) {
                console.log(e.toString())
                process.exit(1)
            }
        }
    })

    cmd = cmd.command({
        command: "login",
        desc: 'log user into lobby',
        handler: async () => {
            var username = readline.question('username: ');
            var password = readline.question('password: ', {
                hideEchoBack: true,
            })
            const payload = JSON.stringify({username, password})
            let file;
            try {
                res = await cliLobbyRequester(Lobby.PathLogin, payload, "POST", "application/json")
                if (res.statusCode != 200) {
                    throw new Error(res.data)
                }
                file = await fs.open(CMD_AUTH_FILE, consts.O_CREAT | consts.O_RDWR, consts.S_IRWXU)
                await file.chown(process.getuid(), process.getgid())
                await file.write(res.data, 0, 'utf8')
                
                res = await cliLobbyRequester(Lobby.PathWhoAmI, "", "GET", "text/plain")
                if (res.statusCode != 200) {
                    throw new Error(res.data)
                }
                console.log(`Welcome Player #${res.data.id} ${res.data.username}!`)
            } catch (e) {
                console.log(e)
            } finally {
                await file?.close()
                process.exit(0)
            }

        }
    })

    cmd = cmd.command({
        command: "who-am-i",
        desc: 'describe username',
        handler: async () => {
            try {
                const { statusCode, data } = await cliLobbyRequester(Lobby.PathWhoAmI, "", "GET", "text/plain")
                if (statusCode != 200) {
                    console.log(data)
                    throw new Error(data)
                }
                console.log("Welcome", data.username, "!")
                process.exit(0)
            } catch (e) {
                console.log(e)
                process.exit(1)
            }
        }
    })

    cmd = cmd.command({
        command: "new-game-room <shortName> [password]",
        desc: 'create a new game room within lobby',
        handler: async (argv) => {
            try {
                ws = await _getWS()
                const g = await cliLobbyRequester(Lobby.PathNewGameRoom, JSON.stringify({ 
                    shortName: argv.shortName, 
                    password: argv.password
                }), "POST", "application/json")
                console.log(`Welcome to gameroom #${g.id}, ${g.shortName}!`)
                process.exit(0)
            } catch (e) {
                console.log(e)
                process.exit(1)
            }
        }
    })

    cmd = cmd.command({
        command: "list-game-rooms",
        desc: 'list game rooms within lobby',
        handler: async () => {
            try {
                const { data } = await cliLobbyRequester(Lobby.PathListGameRooms)
                console.log(data)
                process.exit(0)
            } catch (e) {
                console.log(e.toString())
                process.exit(1)
            }
        }
    })

    cmd = cmd.command({
        command: "join-game-room <id> [password]",
        desc: 'join a game room within lobby',
        handler: async (argv) => {
            try {
                const p = _getPlayer()
                const ws = _getWS()
                await cliLobbyRequester(Lobby.PathJoinGameRoom, JSON.stringify({
                    id: argv.id,
                    password: argv.password
                }))
                console.log(`Welcome to gameroom# ${argc.id}, ${p.username}!`)
                await decorateGameRoom(ws)
            } catch (e) {
                console.log(e.toString())
                process.exit(1)
            }
        }
    })

    cmd = cmd.command({
        command: "select-game",
        desc: 'if game owner, selects the game to play in this room',
        handler: async () => {
            try {
                const p = await _getPlayer()
                const gameRooms = await _getGameRooms()
                const gr = gameRooms.find((g) => { return g.gameRoomOwnerPlayerId == p.id })
                if(gr == undefined) {
                    console.log(ERR_GAMEROOM_NOT_FOUND)
                    process.exit(1)
                }
                const response = await prompt({
                    type: 'select',
                    name: 'value',
                    message: 'Please Choose a Game:',
                    choices: gameRooms[gr.id].games.map((v, i) => {return {
                        "message": `${v.GAME_NAME}: ${v.GAME_DESCRIPTION}`,
                        "name": v.GAME_NAME,
                        "value": i
                    }})
                })
                for(const gameidx in gr.games) {
                    if (gr.games[gameidx].GAME_NAME == response.value) {
                        await cliLobbyRequester(Lobby.PathSelectGame, JSON.stringify({ 
                            id: gr.id, 
                            gameidx: gameidx
                        }), "POST", "application/json")
                    }
                }
                process.exit(0)
            } catch (e) {
                console.log(e.toString())
                process.exit(1)
            }
        }
    })

    cmd = cmd.command({
        command: "player-ready",
        desc: 'marks yourself as ready to participate in lobby game',
        handler: async (argv) => {
            try {
                await cliLobbyRequester(Lobby.PathPlayerReady, JSON.stringify({
                    ready: argv.ready
                }))
                process.exit(0)
            } catch (e) {
                console.log(e.toString())
                process.exit(1)
            }
        }
    })

    cmd = cmd.command({
        command: "start",
        desc: 'if game owner, will start the game once all players are marked ready',
        handler: async () => {
            try {
                await cliLobbyRequester(lobby.PathStartGame, JSON.stringify({ 
                    id: g.id
                }))
                
            } catch (e) {
                console.log(e.toString())
                process.exit(1)
            }
        }
    })

    cmd.parse()


}




