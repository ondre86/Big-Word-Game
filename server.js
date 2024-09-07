const express = require('express')
const app = express()
const expressWS = require('express-ws')(app)
const helmet = require('helmet')
// const { rateLimit } = require('express-rate-limit')
// const limiter = rateLimit({
// 	windowMs: 1 * 60 * 1000,
// 	limit: 45, // Limit each IP to 45 POST requests per minute (45 words per minute)
// 	standardHeaders: true, 
// 	legacyHeaders: false
// })
const syl = require('syllabificate')
const profanity = require('@2toad/profanity')
const pf = new profanity.Profanity({wholeWord: false})
const letterArray = "abcdefghijklmnopqrstuvwxyz".split("")
const port = 8383

// EXPRESS SERVER
// app.use(limiter)
// app.set('trust proxy', 1)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            connectSrc: ["'self'",
                "https://api-gateway.umami.dev/api/send"
            ],
            scriptSrc: ["'self'", 
                "https://unpkg.com/vue@3.4.38/dist/vue.global.prod.js", 
                "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js", 
                "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollToPlugin.min.js", 
                "https://cloud.umami.is/script.js",,
                "'unsafe-eval'"],
        },
      },
}))
app.disable('x-powered-by')
app.use(express.static('public')).use(express.json()).use(express.text())

app.post('/', async (req, res)=>{
    // FAIL
    if (!req.body){ 
        return res.status(400).send({ status: 'failed' }) 
    }
    else{
        directPostMessages(req, res)
    }
})

app.get("/", (req, res) => {
    res.status(200).send()
})

app.ws('/', function(ws, req) {
    ws.on('message', function (msg) {
        if (lobbies.length == 0){
            receiveSocketAndPlaceInLobby(ws, msg)
        }
        deliverSocketMessage(ws, msg)
    })

    ws.on('close', function (msg) {
        removeLobby(ws)  
        removeSocket(ws)  
    })
})

app.use((req, res, next) => {
    res.status(404).sendFile('404.html', {root: 'public'})
})
  
app.use((err, req, res, next) => {
    res.status(500).send('Something broke!')
})

app.listen(port)

// DICTIONARY API
let dictionaryData
async function dictionaryCall(input){
    try{
        const response = await fetch(`https://www.dictionaryapi.com/api/v3/references/collegiate/json/${input}?key=${process.env.API_KEY}`)
        if (!response.ok){
            throw new Error("Could not fetch resource")
        }
        dictionaryData = await response.json()
    }
    catch(e){
        console.error(e)
    }
}

// PLAYER INFORMATION
let registeredOnlineUsernames = new Set()
let registeredOnlinePlayers = []
let sockets = []
let partyLeaders = new Set()
let parties = []
let lobbies = []
let lookingForMatch

class OnlineRegisteredPlayer {
    constructor(req) {
        this.oldUsername = req.body.oldUsername
        this.oldJoinDate = req.body.oldJoinDate
        this.username = req.body.username
        this.joinDate = req.body.joinDate
    }
}
class SearchingSocket {
    constructor(ws, msg) {
        this.socket = ws 
        this.details = {
            mode: JSON.parse(msg).mode ? JSON.parse(msg).mode : null,
            order: JSON.parse(msg).order ? JSON.parse(msg).order : null
        }
        this.username = JSON.parse(msg).username
        this.uuid = crypto.randomUUID() 
        this.triesToConnect = 0
        this.inParty = JSON.parse(msg).inParty
        this.inPartyTimeCheck = null
        this.inPartyInactiveMinutes = 0
        this.partyLeader = JSON.parse(msg).partyLeader
        this.isPartyLeader = JSON.parse(msg).isPartyLeader
    }
    startPartyTimeoutClock(){
        this.inPartyTimeCheck = setInterval(() => {
            for (let sock in sockets){
                if (this.socket == sockets[sock].socket){
                    this.inPartyInactiveMinutes++
                }
            }
            if (this.inPartyInactiveMinutes == 2){
                if (this.isPartyLeader){partyLeaders.delete(this.username)}
                else {
                    this.socket.send(JSON.stringify({
                        waiting: false
                    }))
                    for (let ls in sockets){
                        if (sockets[ls].username == this.partyLeader){
                            sockets[ls].startPartyTimeoutClock()
                        }
                    }
                }

                removePairs(this.username)
                this.clearPartyTimeoutClock()
                this.socket.close()
            }
        }, 60000)
    }
    clearPartyTimeoutClock(){
        clearInterval(this.inPartyTimeCheck)
        this.inPartyInactiveMinutes = 0
    }
}
class GameRoom {
    constructor(p1, p2) {
        this.details = p1.details ? p1.details : p2.details
        this.lobbyID = crypto.randomUUID()
        this.turns = 0
        this.clIndex = 0
        this.currentLetter = "a"
        this.lettersPlayed = 0
        this.player1 = new PlayingSocket(p1)
        this.player2 = new PlayingSocket(p2)
        this.player1Turn = null
    }
    changeLetter(){
        this.lettersPlayed++
        if (this.details.order == "default"){
            if (this.clIndex == 25){
                this.clIndex = 0
                this.currentLetter = letterArray[this.clIndex]
            }
            else {
                this.clIndex++
                this.currentLetter = letterArray[this.clIndex]
            }
        }
        else {
            this.clIndex = Math.floor(Math.random() * 26)
            this.currentLetter = letterArray[this.clIndex]
        }
    }
    startGame() {
        if (this.details.order != "default"){
            this.clIndex = Math.floor(Math.random() * 26)
            this.currentLetter = letterArray[this.clIndex]
        }
        if (this.details.mode == "Classic"){
            this.player1Turn = true
            this.player1.socket.send(JSON.stringify({
                mode: this.details.mode,
                isClassic: true,
                isYourTurn: true,
                inGame: true,
                waiting: false,
                letter: this.currentLetter,
                letterIndex: this.clIndex,
                opponent: this.player2.username
            }))
            this.player2.socket.send(JSON.stringify({
                mode: this.details.mode,
                isClassic: true,
                isYourTurn: false,
                inGame: true,
                waiting: false,
                letter: this.currentLetter,
                letterIndex: this.clIndex,
                opponent: this.player1.username
            }))
        }
        else {
            this.player1.socket.send(JSON.stringify({
                mode: this.details.mode,
                inGame: true,
                waiting: false,
                letter: this.currentLetter,
                letterIndex: this.clIndex,
                opponent: this.player2.username
            }))
            this.player2.socket.send(JSON.stringify({
                mode: this.details.mode,
                inGame: true,
                waiting: false,
                letter: this.currentLetter,
                letterIndex: this.clIndex,
                opponent: this.player1.username
            }))
        }
    }
}
class PlayingSocket {
    constructor(SearchingSocket) {
        this.socket = SearchingSocket.socket
        this.uuid = SearchingSocket.uuid
        this.username = SearchingSocket.username
        this.totalScore = 0
        this.strikes = null
        this.wordPlayedList = []
        this.lastWordPlayed = null
    }
}
class PlayedWord {
    constructor(msg) {
        this.word = msg.word
        this.score = msg.score
        this.time = msg.time
        this.autoSent = msg.autoSent
    }
}

// FUNCTIONS
// handling messages
function removeSocket(ws){
    for (s in sockets){
        if (sockets[s].socket == ws){
            if (lookingForMatch) {clearInterval(lookingForMatch)}
        }
    }
    sockets = sockets.filter(s => s.socket !== ws)
}
function removeLobby(ws) {
    try {
        for (l in lobbies){
            if (lobbies[l].player1.socket == ws){
                lobbies[l].player2.socket.send(JSON.stringify({
                    opponentForfeit: true,
                    reason: "Opponent quit or disconnected",
                    otherScore: lobbies[l].player1.totalScore
                }))
            }
            if (lobbies[l].player2.socket == ws){
                lobbies[l].player1.socket.send(JSON.stringify({
                    opponentForfeit: true,
                    reason: "Opponent quit or disconnected",
                    otherScore: lobbies[l].player2.totalScore
                }))
            }
            removeFromOnlineAfterGame(ws)
        } 
    } catch (error) {
        for (l in lobbies){
            if (lobbies[l].player1.socket == ws){
                lobbies[l].player2.socket.send(JSON.stringify({
                    opponentForfeit: true,
                    reason: "Opponent quit or disconnected",
                }))
            }
            if (lobbies[l].player2.socket == ws){
                lobbies[l].player1.socket.send(JSON.stringify({
                    opponentForfeit: true,
                    reason: "Opponent quit or disconnected",
                }))
            }
            removeFromOnlineAfterGame(ws)
        }
    }
}
function removePairs(username) {
    for (let pair in parties) {
        // LEADER ENDS THE PARTY
        if (parties[pair] && parties[pair][0] && parties[pair][0] == username){
            for (s in sockets){
                if (sockets[s].username == parties[pair][1]){
                    sockets[s].socket.send(JSON.stringify({
                        waiting: false
                    }))
                    sockets[s].socket.close()
                    sockets = sockets.filter(socket => socket.username !== sockets[s].username)
                }
            }
            sockets = sockets.filter(socket => socket.username !== username)
            parties.splice(pair, 1)
        }
        // MEMBER LEAVES THE PARTY
        if (parties[pair] && parties[pair][1] && parties[pair][1] == username){
            for (s in sockets){
                if (sockets[s].username == parties[pair][0]){
                    sockets[s].socket.send(JSON.stringify({
                        partyMemberUsername: ' '
                    }))
                }
            }
            sockets = sockets.filter(socket => socket.username !== username)
            parties.splice(pair, 1)
        }
    }
}
function removeFromOnlineAfterGame(ws) {
    removePairs(lobbies[l].player1.username)
    partyLeaders.delete(lobbies[l].player1.username)
    for (player in registeredOnlinePlayers){
        if (lobbies[l].player1.username == registeredOnlinePlayers[player].username){
            registeredOnlinePlayers.splice(player, 1)
        }
        else if (lobbies[l].player2.username == registeredOnlinePlayers[player].username){
            registeredOnlinePlayers.splice(player, 1)
        }
    }
    registeredOnlineUsernames.delete(lobbies[l].player1.username)
    registeredOnlineUsernames.delete(lobbies[l].player2.username)
    lobbies[l].player1.socket.close()
    lobbies[l].player2.socket.close()
    lobbies = lobbies.filter(l => (l.player1.socket !== ws))
    lobbies = lobbies.filter(l => (l.player2.socket !== ws))
}
async function directPostMessages(req, res) {
    directDictionaryMessages(req, res)
    directOnlineWorldMessages(req, res)
    directPartyMessages(req, res)

    async function directDictionaryMessages(req, res) {
        // DICTIONARY CALL
        if (req.body.input){
            await dictionaryCall(req.body.input)
            res.status(200).send({ 
                data: dictionaryData,
                tps: syl.countSyllables(req.body.input)
            })
        }
    }
    function directOnlineWorldMessages(req, res) {
        // JOIN ONLINE WORLD
        if (req.body.request == "join"){
            if (pf.exists(req.body.username)){
                res.status(200).send({ 
                    registered: false,
                    profane: true
                })
            }
            if (registeredOnlineUsernames.has(req.body.username)){
                res.status(200).send({ 
                    registered: false
                })
            }
            else {
                if (req.body.oldUsername && req.body.oldJoinDate){
                    for (player in registeredOnlinePlayers){
                        if ((req.body.oldUsername == registeredOnlinePlayers[player].username) && (req.body.oldJoinDate == registeredOnlinePlayers[player].oldJoinDate)){
                            registeredOnlinePlayers.splice(player, 1)
                            registeredOnlineUsernames.delete(req.body.oldUsername)
                        }
                    }
                }
                registeredOnlinePlayers.push(new OnlineRegisteredPlayer(req))
                registeredOnlineUsernames.add(registeredOnlinePlayers[registeredOnlinePlayers.length-1].username)

                res.status(200).send({ 
                    registered: true
                })
            }
        }
        // LEAVING ONLINE
        if (typeof req.body === "string" ){
            if (JSON.parse(req.body).request == "leave"){
                for (player in registeredOnlinePlayers){
                    if ((JSON.parse(req.body).username == registeredOnlinePlayers[player].username)){
                        registeredOnlinePlayers.splice(player, 1)
                    }
                }
                registeredOnlineUsernames.delete(JSON.parse(req.body).username)

                if (JSON.parse(req.body).partyLeaderUsername){
                    partyLeaders.delete(JSON.parse(req.body).partyLeaderUsername)
                }
                else {partyLeaders.delete(JSON.parse(req.body).username)}
                
                removePairs(JSON.parse(req.body).username)
            }
        }

    }
    function directPartyMessages(req, res) {
        // CREATE A PARTY
        if (req.body.partyRequest == "create"){
            if (!partyLeaders.has(req.body.username)){
                partyLeaders.add(req.body.username)
                res.status(200).send({ 
                    createdNewParty: true
                })
            }
            else {
                res.status(200).send({ 
                    createdNewParty: false,
                })
            }
        }
        // JOIN A PARTY
        if (req.body.partyRequest == "join"){            
            if (!checkIsInactiveParty(req, res) && !checkIsOwnName(req, res) && !checkIsPartyFull(req, res)){
                parties.push([req.body.partyLeaderUsername, req.body.username])
                res.status(200).send({ 
                    joinedParty: true,
                    waiting: true
                })
            }
        }

        function checkIsInactiveParty(req, res) {
            if (!partyLeaders.has(req.body.partyLeaderUsername)){
                res.status(200).send({ 
                    joinedParty: false,
                    inactive: true
                })
                return true
            }
            return false
        }
        function checkIsOwnName(req, res) {
            if (req.body.partyLeaderUsername == req.body.username){
                res.status(200).send({ 
                    joinedParty: false,
                    duplicate: true
                })
                return true
            }
            else return false
        }
        function checkIsPartyFull(req, res) {
            for (let pair in parties) {
                if (parties[pair] && parties[pair][0] && parties[pair][0] == req.body.partyLeaderUsername){
                    res.status(200).send({ 
                        joinedParty: false,
                        full: true
                    })
                    return true
                }
            }
            return false
        }
    }
}
function deliverSocketMessage(ws, msg) {    
    if (JSON.parse(msg).partyRequest){
        if (JSON.parse(msg).partyRequest === "delete"){
            partyLeaders.delete(JSON.parse(msg).username)
            removePairs(JSON.parse(msg).username)
            ws.close()
            return
        }
        if (JSON.parse(msg).partyRequest === "leave"){
            // partyLeaders.delete(JSON.parse(msg).partyLeader)
            removePairs(JSON.parse(msg).username)
            ws.close()
            return
        }
    }
    else{
        let messageFoundLobby
        for(l in lobbies){
            if (ws == lobbies[l].player1.socket || ws == lobbies[l].player2.socket){
                messageFoundLobby = true
                assignWSMessageToLobbyPlayer(ws, msg)
                decideGameMode()
            }
            if (l == lobbies.length-1 && !messageFoundLobby){
                receiveSocketAndPlaceInLobby(ws, msg)
            }
        }
    }
}
function receiveSocketAndPlaceInLobby(ws, msg) {
    determineMatchmakingMode() 

    function determineMatchmakingMode() {
        if (!checkIfPartyMSG()){
            if (parties.length > 0){
                for (pair in parties){
                    let foundPairToStartPartyGame
                    if (parties[pair][0] == JSON.parse(msg).username){
                        if (JSON.parse(msg).mode){
                            foundPairToStartPartyGame = true
                            let partyGameRoom = makeMatch(sockets[sockets.length-1], JSON.parse(msg))
                            partyGameRoom.startGame()
                        }
                    }
                    if (pair == parties.length-1 && !foundPairToStartPartyGame){
                        sockets.push(new SearchingSocket(ws, msg))
                        sockets[sockets.length-1].socket.send(JSON.stringify({
                            waiting: true
                        }))
                        searching(sockets[sockets.length-1])
                    }
                }
            }
            else {
                sockets.push(new SearchingSocket(ws, msg))
                sockets[sockets.length-1].socket.send(JSON.stringify({
                    waiting: true
                }))
                searching(sockets[sockets.length-1])
            }
        }
    }
    function checkIfPartyMSG() {
        if (JSON.parse(msg).inParty || JSON.parse(msg).isPartyLeader || JSON.parse(msg).partyRequest){
            if (JSON.parse(msg).inParty){
                sockets.push(new SearchingSocket(ws, msg))
                sockets[sockets.length-1].startPartyTimeoutClock()
                sockets[sockets.length-1].socket.send(JSON.stringify({
                    waiting: true
                }))
                for (s in sockets){
                    if (sockets[s].username == JSON.parse(msg).partyLeader){
                        sockets[s].clearPartyTimeoutClock()
                        sockets[s].socket.send(JSON.stringify({
                            partyMemberUsername: JSON.parse(msg).username
                        }))
                    }
                }
                return true
            }
            if (JSON.parse(msg).isPartyLeader){
                sockets.push(new SearchingSocket(ws, msg))
                sockets[sockets.length-1].startPartyTimeoutClock()
                return true
            }
            if (JSON.parse(msg).partyRequest){
                return true
            }
        }
        else {return false}
    }
    function searching(client) {
        client.triesToConnect++
        if (client.triesToConnect >= 15){
            client.socket.close()
            return false
        }
        if (!makeMatch(client)){
            lookingForMatch = setTimeout(() => {
                searching(client)
            }, 1000)
        }
        else { clearTimeout(lookingForMatch) }
    }  
    function makeMatch(client, msg){
        let createdGame
        // MATCHMAKING
        for (x of sockets){
            // RANDOM - create Game Room and start game instantly once match is made
            if ((x.details.mode == client.details.mode && x.details.order == client.details.order) 
                && (x.uuid != client.uuid && x.socket != client.socket) 
                && !((x.isPartyLeader && client.inParty) && (x.username === client.partyLeader)))
            {
                createdGame = createGameRoom(x, client)
                createdGame.startGame()
                return true
            }
            // PARTY - create Game Room and start game once member has joined leader
            if ((x.isPartyLeader && client.inParty) && (x.username === client.partyLeader)){
                x.details = {
                    mode: msg.mode,
                    order: msg.order
                }
                client.clearPartyTimeoutClock()
                createdGame = createGameRoom(x, client)
                return createdGame
            }
            if (x == sockets.length-1 && !createdGame){
                return false 
            }
        }

        function createGameRoom(x, client) {
            client.triesToConnect = 0
            let lobby = new GameRoom(x, client)

            if (lobby && lobby != ''){
                lobbies.push(lobby)
            }

            sockets = sockets.filter(s => s.uuid !== client.uuid)
            sockets = sockets.filter(s => s.uuid !== x.uuid)

            return lobby
        }
    }

    
}

// game logic
function assignWSMessageToLobbyPlayer(ws, msg) {
    if (ws == lobbies[l].player1.socket && !JSON.parse(msg).mode){
        lobbies[l].turns++
        lobbies[l].player1.strikes = JSON.parse(msg).strikes
        lobbies[l].player1.wordPlayedList.push(new PlayedWord(JSON.parse(msg)))
        lobbies[l].player1.lastWordPlayed = lobbies[l].player1.wordPlayedList[lobbies[l].player1.wordPlayedList.length-1]
    }
    if (ws == lobbies[l].player2.socket && !JSON.parse(msg).mode){
        lobbies[l].turns++
        lobbies[l].player2.strikes = JSON.parse(msg).strikes
        lobbies[l].player2.wordPlayedList.push(new PlayedWord(JSON.parse(msg)))
        lobbies[l].player2.lastWordPlayed = lobbies[l].player2.wordPlayedList[lobbies[l].player2.wordPlayedList.length-1]
    }
}
function decideGameMode() {
    // TWO PLAYERS AT ONCE - ONE ROUND
    if (lobbies[l].details.mode != 'Classic' && (lobbies[l].turns % 2 == 0 && lobbies[l].turns >= 2)){
        check2PWinner()
        checkStrikeOutAndBroadcast()
        checkRoundEndAndBroadcast()
    }
    // ONE PLAYER AT A TIME - UNLIMITED
    if (lobbies[l].details.mode == 'Classic' && lobbies[l].turns >= 1){
        checkClassicWinner()
        checkStrikeOutAndBroadcast()
        flipTurns()
    }
}
function check2PWinner() {
    if (lobbies[l].details.mode == 'Battle'){
        if (lobbies[l].player1.lastWordPlayed.score > lobbies[l].player2.lastWordPlayed.score){
            broadcastWinnerAndAdvance(lobbies[l].player1, lobbies[l].player2)
        }
        else if (lobbies[l].player1.lastWordPlayed.score == lobbies[l].player2.lastWordPlayed.score){
            broadcastTieAndAdvance(lobbies[l].player1, lobbies[l].player2)
        }
        else { 
            broadcastWinnerAndAdvance(lobbies[l].player2, lobbies[l].player1)
        }
    }
    if (lobbies[l].details.mode == 'Speed'){
        // TIE CHECK (NULL / AUTOSENT / EQUAL TIME)
        if ((!lobbies[l].player1.lastWordPlayed.word && !lobbies[l].player2.lastWordPlayed.word)
            || ((lobbies[l].player1.lastWordPlayed.word && lobbies[l].player2.lastWordPlayed.word) && (lobbies[l].player1.lastWordPlayed.autoSent && lobbies[l].player2.lastWordPlayed.autoSent))
            || lobbies[l].player1.lastWordPlayed.time == lobbies[l].player2.lastWordPlayed.time){

            broadcastTieAndAdvance(lobbies[l].player1, lobbies[l].player2)
        }
        // WINNER CHECK (TIME / NULL)
        else{
            if (((lobbies[l].player1.lastWordPlayed.word && lobbies[l].player2.lastWordPlayed.word) && lobbies[l].player1.lastWordPlayed.time < lobbies[l].player2.lastWordPlayed.time) 
                || (lobbies[l].player1.lastWordPlayed.word && !lobbies[l].player2.lastWordPlayed.word)){
                
                broadcastWinnerAndAdvance(lobbies[l].player1, lobbies[l].player2)
            }
            else if ((lobbies[l].player1.lastWordPlayed.word && lobbies[l].player2.lastWordPlayed.word) && (lobbies[l].player2.lastWordPlayed.time < lobbies[l].player1.lastWordPlayed.time) 
                || (lobbies[l].player2.lastWordPlayed.word && !lobbies[l].player1.lastWordPlayed.word)) { 
                
                broadcastWinnerAndAdvance(lobbies[l].player2, lobbies[l].player1)
            }
        }
    }
}
function checkClassicWinner() {
    if (lobbies[l].player1Turn){
        if (lobbies[l].player1.lastWordPlayed.word != null) { 
            classicBroadcastWinnerAndAdvance(lobbies[l].player1, lobbies[l].player2)
        }
        else {
            classicBroadcastTieAndAdvance(lobbies[l].player1, lobbies[l].player2)
        }
    }      
    if (!lobbies[l].player1Turn){
        if (lobbies[l].player2.lastWordPlayed.word != null) { 
            classicBroadcastWinnerAndAdvance(lobbies[l].player2, lobbies[l].player1)
        }
        else {
            classicBroadcastTieAndAdvance(lobbies[l].player2, lobbies[l].player1)
        }
    }
}
function broadcastWinnerAndAdvance(winner, loser) {
    winner.totalScore += winner.lastWordPlayed.score
    lobbies[l].changeLetter()
    winner.socket.send(JSON.stringify({
        winner: true,
        winningWord: winner.lastWordPlayed.word,
        letter: lobbies[l].currentLetter,
        letterIndex: lobbies[l].clIndex,
        score: winner.lastWordPlayed.score
    }))
    loser.socket.send(JSON.stringify({
        winner: false,
        winningWord: winner.lastWordPlayed.word,
        letter: lobbies[l].currentLetter,
        letterIndex: lobbies[l].clIndex,
        score: loser.lastWordPlayed.score
    }))
}
function broadcastTieAndAdvance(p1, p2) {
    p1.socket.send(JSON.stringify({
        winner: "tie",
        letter: lobbies[l].currentLetter,
        letterIndex: lobbies[l].clIndex,
        score: p1.lastWordPlayed.score
    }))
    p2.socket.send(JSON.stringify({
        winner: "tie",
        letter: lobbies[l].currentLetter,
        letterIndex: lobbies[l].clIndex,
        score: p2.lastWordPlayed.score
    }))
}
function classicBroadcastWinnerAndAdvance(winner, loser) {
    winner.totalScore += winner.lastWordPlayed.score
    lobbies[l].changeLetter()
    winner.socket.send(JSON.stringify({
        winner: true,
        winningWord: winner.lastWordPlayed.word,
        letter: lobbies[l].currentLetter,
        letterIndex: lobbies[l].clIndex,
        score: winner.lastWordPlayed.score,
        isYourTurn: false
    }))
    loser.socket.send(JSON.stringify({
        winner: false,
        winningWord: winner.lastWordPlayed.word,
        letter: lobbies[l].currentLetter,
        letterIndex: lobbies[l].clIndex,
        isYourTurn: true
    }))
}
function classicBroadcastTieAndAdvance(currentPlayer, otherPlayer) {
    currentPlayer.socket.send(JSON.stringify({
        winner: "tie",
        letter: lobbies[l].currentLetter,
        letterIndex: lobbies[l].clIndex,
        score: currentPlayer.lastWordPlayed.score,
        isYourTurn: false
    }))
    otherPlayer.socket.send(JSON.stringify({
        winner: "tie",
        letter: lobbies[l].currentLetter,
        letterIndex: lobbies[l].clIndex,
        isYourTurn: true
    }))
}
function checkStrikeOutAndBroadcast() {
    if (lobbies[l].player1.strikes == 3 && lobbies[l].player2.strikes != 3){
        lobbies[l].player1.socket.send(JSON.stringify({
            lost: true,
            totalScore: lobbies[l].player1.totalScore,
            otherScore: lobbies[l].player2.totalScore,
            reason: "You struck out"
        }))
        lobbies[l].player2.socket.send(JSON.stringify({
            won: true,
            totalScore: lobbies[l].player2.totalScore,
            otherScore: lobbies[l].player1.totalScore,
            reason: "Opponent struck out"
        }))
        removeFromOnlineAfterGame()
    }
    else if (lobbies[l].player1.strikes == 3 && lobbies[l].player2.strikes == 3){
        if (lobbies[l].player1.totalScore > lobbies[l].player2.totalScore){
            lobbies[l].player1.socket.send(JSON.stringify({
                won: true,
                totalScore: lobbies[l].player1.totalScore,
                otherScore: lobbies[l].player2.totalScore,
                reason: "You both struck out, but your score was higher!"
            }))
            lobbies[l].player2.socket.send(JSON.stringify({
                lost: true,
                totalScore: lobbies[l].player2.totalScore,
                otherScore: lobbies[l].player1.totalScore,
                reason: "You both struck out, but your score was lower."
            }))
        }
        else if (lobbies[l].player1.totalScore == lobbies[l].player2.totalScore){
            lobbies[l].player1.socket.send(JSON.stringify({
                tie: true,
                totalScore: lobbies[l].player1.totalScore,
                otherScore: lobbies[l].player2.totalScore,
                reason: "You both struck out...and you tied!"
            }))
            lobbies[l].player2.socket.send(JSON.stringify({
                tie: true,
                totalScore: lobbies[l].player2.totalScore,
                otherScore: lobbies[l].player1.totalScore,
                reason: "You both struck out...and you tied!"
            }))
        }
        else {
            lobbies[l].player1.socket.send(JSON.stringify({
                lost: true,
                totalScore: lobbies[l].player1.totalScore,
                otherScore: lobbies[l].player2.totalScore,
                reason: "You both struck out, but your score was lower"
            }))
            lobbies[l].player2.socket.send(JSON.stringify({
                won: true,
                totalScore: lobbies[l].player2.totalScore,
                otherScore: lobbies[l].player1.totalScore,
                reason: "You both struck out, but your score was higher!"
            }))
        }
        removeFromOnlineAfterGame()
    }
    else if ((lobbies[l].player2.strikes == 3 && lobbies[l].player1.strikes != 3)) {
        lobbies[l].player2.socket.send(JSON.stringify({
            lost: true,
            totalScore: lobbies[l].player2.totalScore,
            otherScore: lobbies[l].player1.totalScore,
            reason: "You struck out"
        }))
        lobbies[l].player1.socket.send(JSON.stringify({
            won: true,
            totalScore: lobbies[l].player1.totalScore,
            otherScore: lobbies[l].player2.totalScore,
            reason: "Opponent struck out"
        }))
        removeFromOnlineAfterGame()
    }
}
function checkRoundEndAndBroadcast() {
    if (lobbies[l].lettersPlayed == 26){
        if (lobbies[l].player1.totalScore > lobbies[l].player2.totalScore){
            lobbies[l].player1.socket.send(JSON.stringify({
                won: true,
                totalScore: lobbies[l].player1.totalScore,
                otherScore: lobbies[l].player2.totalScore,
                reason: "Round ended"
            }))
            lobbies[l].player2.socket.send(JSON.stringify({
                lost: true,
                totalScore: lobbies[l].player2.totalScore,
                otherScore: lobbies[l].player1.totalScore,
                reason: "Round ended"
            }))
        }
        else if (lobbies[l].player1.totalScore == lobbies[l].player2.totalScore){
            lobbies[l].player1.socket.send(JSON.stringify({
                tie: true,
                totalScore: lobbies[l].player1.totalScore,
                otherScore: lobbies[l].player2.totalScore,
                reason: "Round ended"
            }))
            lobbies[l].player2.socket.send(JSON.stringify({
                tie: true,
                totalScore: lobbies[l].player2.totalScore,
                otherScore: lobbies[l].player1.totalScore,
                reason: "Round ended"
            }))
        }
        else {
            lobbies[l].player1.socket.send(JSON.stringify({
                lost: true,
                totalScore: lobbies[l].player1.totalScore,
                otherScore: lobbies[l].player2.totalScore,
                reason: "Round ended"
            }))
            lobbies[l].player2.socket.send(JSON.stringify({
                won: true,
                totalScore: lobbies[l].player2.totalScore,
                otherScore: lobbies[l].player1.totalScore,
                reason: "Round ended"
            }))
        }
        removeFromOnlineAfterGame()
    }
}
function flipTurns() {
    if (lobbies[l].player1Turn){lobbies[l].player1Turn = false}
    else if (!lobbies[l].player1Turn){lobbies[l].player1Turn = true}
}




