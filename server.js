const express = require('express')
const helmet = require('helmet')
const syl = require('syllabificate')
const app = express()
const expressWS = require('express-ws')(app)

const port = 8383
let data

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
app.use(express.static('public')).use(express.json())

app.post('/', async (req, res)=>{
    if(!req.body){
        return res.status(400).send({ status: 'failed' })
    }
    if (req.body.mode != null || req.body.mode != undefined){}
    else {await dictionaryCall(req.body.input)}

    res.status(200).send({ 
        data: data,
        tps: syl.countSyllables(req.body.input)
    })
})

app.get("/", (req, res) => {
    res.status(200).send()
})

let sockets = []
let lobbies = []
let letterArray = "abcdefghijklmnopqrstuvwxyz".split("")

function receiveSocketAndPlaceInLobby(ws, msg) {
    sockets.push({
        socket: ws, 
        details: null, 
        uuid: crypto.randomUUID(), 
        inLobby: false, 
        triesToConnect: 0,
        timerInt: null,
        searching: null
    })

    console.log(`current total connections: ${sockets.length}`)
    sockets[sockets.length-1].details = msg
    sockets[sockets.length-1].socket.send(JSON.stringify({
        waiting: true
    }))

    console.log(sockets[sockets.length-1].details)
    console.log(`uuid: ${sockets[sockets.length-1].uuid}`)
    
    searching(sockets[sockets.length-1])

    function searching(client) {
        client.searching = true
        client.triesToConnect++
        if (client.triesToConnect >= 15){
            client.inLobby = false
            client.socket.close()
            return false
        }
        if (!makeMatch(client)){
            looking = setTimeout(() => {
                searching(client)
            }, 1000)
        }
        else { clearTimeout(looking) }
    }
    
    function makeMatch(client){
        let lobby;

        try{
            for (x of sockets){
                if (x.details == client.details && x.uuid != client.uuid && x.socket != client.socket){
                    client.triesToConnect = 0
                    lobby = {
                        lobbyID: crypto.randomUUID(),
                        turns: 0,
                        player1Turn: null,
                        details: JSON.parse(x.details),
                        clIndex: 0,
                        currentLetter: letterArray[this.clIndex],
                        lettersPlayed: 0,
                        player1: {
                            socket: x.socket,
                            uuid: x.uuid,
                            score: null,
                            totalScore: 0,
                            time: null,
                            word: null,
                            strikes: null,
                            autoSent: false
                        },
                        player2: {
                            socket: client.socket,
                            uuid: client.uuid,
                            score: null,
                            totalScore: 0,
                            time: null,
                            word: null,
                            strikes: null,
                            autoSent: false
                        },
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
                    }
                    if (JSON.parse(x.details).order != "default"){
                        lobby.clIndex = Math.floor(Math.random() * 26)
                        lobby.currentLetter = letterArray[this.clIndex]
                    }
                    else {
                        lobby.currentLetter = "a"
                    }

                    if (lobby!=null || lobby!= undefined || lobby != ''){
                        lobbies.push(lobby)
                    }

                    console.log(`lobby ID: ${lobbies[lobbies.length-1].lobbyID}`)
                    console.log(`Player 1: ${lobbies[lobbies.length-1].player1.uuid}`)
                    console.log(`Player 2: ${lobbies[lobbies.length-1].player2.uuid}`)

                    x.inLobby = true
                    client.inLobby = true

                    if (JSON.parse(x.details).mode == "classic"){
                        lobby.player1Turn = true
                        lobby.player1.socket.send(JSON.stringify({
                            isClassic: true,
                            isYourTurn: true,
                            inGame: true,
                            waiting: false,
                            letter: lobby.currentLetter,
                            letterIndex: lobby.clIndex,
                        }))
                        lobby.player2.socket.send(JSON.stringify({
                            isClassic: true,
                            isYourTurn: false,
                            inGame: true,
                            waiting: false,
                            letter: lobby.currentLetter,
                            letterIndex: lobby.clIndex,
                        }))
                    }
                    else {
                        x.socket.send(JSON.stringify({
                            inGame: true,
                            waiting: false,
                            letter: lobby.currentLetter,
                            letterIndex: lobby.clIndex,
                        }))
                        client.socket.send(JSON.stringify({
                            inGame: true,
                            waiting: false,
                            letter: lobby.currentLetter,
                            letterIndex: lobby.clIndex,
                        }))
                    }

                    sockets = sockets.filter(s => s.uuid !== client.uuid)
                    sockets = sockets.filter(s => s.uuid !== x.uuid)
                    
                    return true
                }
                else { return false }
            }
        }
        catch(e){console.error(e)}

        console.log(`lobbies active: ${lobbies.length}`)
    }
}

app.ws('/', function(ws, req) {
    ws.on('message', function (msg) {
        if (lobbies.length == 0){
            receiveSocketAndPlaceInLobby(ws, msg)
        }
        let messageFoundLobby = null;
        for(l in lobbies){
            if (ws == lobbies[l].player1.socket || ws == lobbies[l].player2.socket){
                messageFoundLobby = true
                if (ws == lobbies[l].player1.socket && JSON.parse(msg).mode == undefined){
                    lobbies[l].player1.score = JSON.parse(msg).score
                    lobbies[l].player1.time = JSON.parse(msg).time
                    lobbies[l].player1.word = JSON.parse(msg).word
                    lobbies[l].player1.strikes = JSON.parse(msg).strikes
                    lobbies[l].player1.autoSent = JSON.parse(msg).autoSent
                    lobbies[l].turns++
                }
                if (ws == lobbies[l].player2.socket && JSON.parse(msg).mode == undefined){
                    lobbies[l].player2.score = JSON.parse(msg).score
                    lobbies[l].player2.time = JSON.parse(msg).time
                    lobbies[l].player2.word = JSON.parse(msg).word
                    lobbies[l].player2.strikes = JSON.parse(msg).strikes
                    lobbies[l].player2.autoSent = JSON.parse(msg).autoSent
                    lobbies[l].turns++
                }

                if (lobbies[l].turns % 2 == 0 && lobbies[l].turns >= 2  && lobbies[l].details.mode != 'classic'){
                    if (lobbies[l].player1.score == 0){
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
                            lobbies[l].player1.socket.close()
                            lobbies[l].player2.socket.close()
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
                            lobbies[l].player1.socket.close()
                            lobbies[l].player2.socket.close()
                        }
                    }
                    if (lobbies[l].player2.score == 0){
                        if (lobbies[l].player2.strikes == 3 && lobbies[l].player1.strikes != 3){
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
                            lobbies[l].player1.socket.close()
                            lobbies[l].player2.socket.close()
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
                            lobbies[l].player1.socket.close()
                            lobbies[l].player2.socket.close()
                        }
                    }

                    if (lobbies[l].details.mode == 'war'){
                        if (lobbies[l].player1.score > lobbies[l].player2.score){
                            lobbies[l].player1.totalScore += lobbies[l].player1.score
                            lobbies[l].changeLetter()
                            lobbies[l].player1.socket.send(JSON.stringify({
                                winner: true,
                                winningWord: lobbies[l].player1.word,
                                letter: lobbies[l].currentLetter,
                                letterIndex: lobbies[l].clIndex,
                                score: lobbies[l].player1.score
                            }))
                            lobbies[l].player2.socket.send(JSON.stringify({
                                winner: false,
                                winningWord: lobbies[l].player1.word,
                                letter: lobbies[l].currentLetter,
                                letterIndex: lobbies[l].clIndex,
                                score: lobbies[l].player2.score
                            }))
                        }
                        else if(lobbies[l].player1.score == lobbies[l].player2.score){
                            lobbies[l].player1.socket.send(JSON.stringify({
                                winner: "tie",
                                letter: lobbies[l].currentLetter,
                                letterIndex: lobbies[l].clIndex,
                                score: lobbies[l].player1.score
                            }))
                            lobbies[l].player2.socket.send(JSON.stringify({
                                winner: "tie",
                                letter: lobbies[l].currentLetter,
                                letterIndex: lobbies[l].clIndex,
                                score: lobbies[l].player2.score
                            }))
                        }
                        else { 
                            lobbies[l].player2.totalScore += lobbies[l].player2.score
                            lobbies[l].changeLetter()
                            lobbies[l].player2.socket.send(JSON.stringify({
                                winner: true,
                                winningWord: lobbies[l].player2.word,
                                letter: lobbies[l].currentLetter,
                                letterIndex: lobbies[l].clIndex,
                                score: lobbies[l].player2.score
                            }))
                            lobbies[l].player1.socket.send(JSON.stringify({
                                winner: false,
                                winningWord: lobbies[l].player2.word,
                                letter: lobbies[l].currentLetter,
                                letterIndex: lobbies[l].clIndex,
                                score: lobbies[l].player1.score
                            }))
                        }

                        if (lobbies[l].lettersPlayed == 26){
                            if (lobbies[l].player1.totalScore > lobbies[l].player2.totalScore){
                                lobbies[l].player1.socket.send(JSON.stringify({
                                    won: true,
                                    totalScore: lobbies[l].player1.totalScore,
                                    reason: "Round ended"
                                }))
                                lobbies[l].player2.socket.send(JSON.stringify({
                                    lost: true,
                                    totalScore: lobbies[l].player2.totalScore,
                                    reason: "Round ended"
                                }))
                            }
                            else {
                                lobbies[l].player1.socket.send(JSON.stringify({
                                    lost: true,
                                    totalScore: lobbies[l].player1.totalScore,
                                    reason: "Round ended"
                                }))
                                lobbies[l].player2.socket.send(JSON.stringify({
                                    won: true,
                                    totalScore: lobbies[l].player2.totalScore,
                                    reason: "Round ended"
                                }))
                            }
                        }
                    }

                    if (lobbies[l].details.mode == 'speed'){

                        if (lobbies[l].player1.time < lobbies[l].player2.time){
                            if (lobbies[l].player1.word != null && lobbies[l].player1.autoSent != true){
                                lobbies[l].player1.totalScore += lobbies[l].player1.score
                                lobbies[l].changeLetter()
                                lobbies[l].player1.socket.send(JSON.stringify({
                                    winner: true,
                                    winningWord: lobbies[l].player1.word,
                                    letter: lobbies[l].currentLetter,
                                    letterIndex: lobbies[l].clIndex,
                                    score: lobbies[l].player1.score
                                }))
                                lobbies[l].player2.socket.send(JSON.stringify({
                                    winner: false,
                                    winningWord: lobbies[l].player1.word,
                                    letter: lobbies[l].currentLetter,
                                    letterIndex: lobbies[l].clIndex,
                                    score: lobbies[l].player2.score
                                }))
                            }
                            else if (lobbies[l].player1.word == null && lobbies[l].player2.word != null){
                                lobbies[l].player2.totalScore += lobbies[l].player2.score
                                lobbies[l].changeLetter()
                                lobbies[l].player2.socket.send(JSON.stringify({
                                    winner: true,
                                    winningWord: lobbies[l].player2.word,
                                    letter: lobbies[l].currentLetter,
                                    letterIndex: lobbies[l].clIndex,
                                    score: lobbies[l].player2.score
                                }))
                                lobbies[l].player1.socket.send(JSON.stringify({
                                    winner: false,
                                    winningWord: lobbies[l].player2.word,
                                    letter: lobbies[l].currentLetter,
                                    letterIndex: lobbies[l].clIndex,
                                    score: lobbies[l].player1.score
                                }))
                            }
                            else if ((lobbies[l].player1.word == null && lobbies[l].player2.word == null) || (lobbies[l].player1.autoSent == true && lobbies[l].player2.autoSent == true)){
                                lobbies[l].player1.socket.send(JSON.stringify({
                                    winner: "tie",
                                    letter: lobbies[l].currentLetter,
                                    letterIndex: lobbies[l].clIndex,
                                    score: lobbies[l].player1.score
                                }))
                                lobbies[l].player2.socket.send(JSON.stringify({
                                    winner: "tie",
                                    letter: lobbies[l].currentLetter,
                                    letterIndex: lobbies[l].clIndex,
                                    score: lobbies[l].player2.score
                                }))
                            }
                        }
                        else if (lobbies[l].player1.time > lobbies[l].player2.time) { 
                            if (lobbies[l].player2.word != null && lobbies[l].player2.autoSent != true){
                                lobbies[l].player2.totalScore += lobbies[l].player2.score
                                lobbies[l].changeLetter()
                                lobbies[l].player2.socket.send(JSON.stringify({
                                    winner: true,
                                    winningWord: lobbies[l].player2.word,
                                    letter: lobbies[l].currentLetter,
                                    letterIndex: lobbies[l].clIndex,
                                    score: lobbies[l].player2.score
                                }))
                                lobbies[l].player1.socket.send(JSON.stringify({
                                    winner: false,
                                    winningWord: lobbies[l].player2.word,
                                    letter: lobbies[l].currentLetter,
                                    letterIndex: lobbies[l].clIndex,
                                    score: lobbies[l].player1.score
                                }))
                            }
                            else if (lobbies[l].player2.word == null && lobbies[l].player1.word != null){
                                lobbies[l].player1.totalScore += lobbies[l].player1.score
                                lobbies[l].changeLetter()
                                lobbies[l].player1.socket.send(JSON.stringify({
                                    winner: true,
                                    winningWord: lobbies[l].player1.word,
                                    letter: lobbies[l].currentLetter,
                                    letterIndex: lobbies[l].clIndex,
                                    score: lobbies[l].player1.score
                                }))
                                lobbies[l].player2.socket.send(JSON.stringify({
                                    winner: false,
                                    winningWord: lobbies[l].player1.word,
                                    letter: lobbies[l].currentLetter,
                                    letterIndex: lobbies[l].clIndex,
                                    score: lobbies[l].player2.score
                                }))
                            }
                            else if (lobbies[l].player1.word == null && lobbies[l].player2.word == null){
                                lobbies[l].player1.socket.send(JSON.stringify({
                                    winner: "tie",
                                    letter: lobbies[l].currentLetter,
                                    letterIndex: lobbies[l].clIndex,
                                    score: lobbies[l].player1.score
                                }))
                                lobbies[l].player2.socket.send(JSON.stringify({
                                    winner: "tie",
                                    letter: lobbies[l].currentLetter,
                                    letterIndex: lobbies[l].clIndex,
                                    score: lobbies[l].player2.score
                                }))
                            }
                            else if ((lobbies[l].player1.word == null && lobbies[l].player2.word == null) || (lobbies[l].player1.autoSent == true && lobbies[l].player2.autoSent == true)){
                                lobbies[l].player1.socket.send(JSON.stringify({
                                    winner: "tie",
                                    letter: lobbies[l].currentLetter,
                                    letterIndex: lobbies[l].clIndex,
                                    score: lobbies[l].player1.score
                                }))
                                lobbies[l].player2.socket.send(JSON.stringify({
                                    winner: "tie",
                                    letter: lobbies[l].currentLetter,
                                    letterIndex: lobbies[l].clIndex,
                                    score: lobbies[l].player2.score
                                }))
                            }
                        }

                        if (lobbies[l].lettersPlayed == 26){
                            if (lobbies[l].player1.totalScore > lobbies[l].player2.totalScore){
                                lobbies[l].player1.socket.send(JSON.stringify({
                                    won: true,
                                    totalScore: lobbies[l].player1.totalScore,
                                    reason: "Round ended"
                                }))
                                lobbies[l].player2.socket.send(JSON.stringify({
                                    lost: true,
                                    totalScore: lobbies[l].player2.totalScore,
                                    reason: "Round ended"
                                }))
                            }
                            else if (lobbies[l].player1.totalScore == lobbies[l].player2.totalScore){
                                lobbies[l].player1.socket.send(JSON.stringify({
                                    tie: true,
                                    totalScore: lobbies[l].player1.totalScore,
                                    reason: "Round ended"
                                }))
                                lobbies[l].player2.socket.send(JSON.stringify({
                                    tie: true,
                                    totalScore: lobbies[l].player2.totalScore,
                                    reason: "Round ended"
                                }))
                            }
                            else {
                                lobbies[l].player1.socket.send(JSON.stringify({
                                    lost: true,
                                    totalScore: lobbies[l].player1.totalScore,
                                    reason: "Round ended"
                                }))
                                lobbies[l].player2.socket.send(JSON.stringify({
                                    won: true,
                                    totalScore: lobbies[l].player2.totalScore,
                                    reason: "Round ended"
                                }))
                            }
                        }
                    }
                }

                if (lobbies[l].details.mode == 'classic' && lobbies[l].turns >= 1){

                    if (lobbies[l].player1Turn == true){
                        if (lobbies[l].player1.word != null) { 
                            lobbies[l].player1.totalScore += lobbies[l].player1.score
                            lobbies[l].changeLetter()
                            lobbies[l].player1.socket.send(JSON.stringify({
                                winner: true,
                                letter: lobbies[l].currentLetter,
                                winningWord: lobbies[l].player1.word,
                                letterIndex: lobbies[l].clIndex,
                                score: lobbies[l].player1.score,
                                isYourTurn: false
                            }))
                            lobbies[l].player2.socket.send(JSON.stringify({
                                winner: false,
                                winningWord: lobbies[l].player1.word,
                                letter: lobbies[l].currentLetter,
                                letterIndex: lobbies[l].clIndex,
                                isYourTurn: true
                            }))
                        }
                        else {
                            lobbies[l].player1.socket.send(JSON.stringify({
                                winner: "tie",
                                letter: lobbies[l].currentLetter,
                                letterIndex: lobbies[l].clIndex,
                                score: lobbies[l].player1.score,
                                isYourTurn: false
                            }))
                            lobbies[l].player2.socket.send(JSON.stringify({
                                winner: "tie",
                                letter: lobbies[l].currentLetter,
                                letterIndex: lobbies[l].clIndex,
                                isYourTurn: true
                            }))
                            if (lobbies[l].player1.score == 0){
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
                                    lobbies[l].player1.socket.close()
                                    lobbies[l].player2.socket.close()
                                }
                            }
                        }
                    }      
                    if (lobbies[l].player1Turn == false){
                        if (lobbies[l].player2.word != null) { 
                            lobbies[l].player2.totalScore += lobbies[l].player2.score
                            lobbies[l].changeLetter()
                            lobbies[l].player2.socket.send(JSON.stringify({
                                winner: true,
                                winningWord: lobbies[l].player2.word,
                                letter: lobbies[l].currentLetter,
                                letterIndex: lobbies[l].clIndex,
                                score: lobbies[l].player2.score,
                                isYourTurn: false
                            }))
                            lobbies[l].player1.socket.send(JSON.stringify({
                                winner: false,
                                winningWord: lobbies[l].player2.word,
                                letter: lobbies[l].currentLetter,
                                letterIndex: lobbies[l].clIndex,
                                isYourTurn: true
                            }))
                        }
                        else {
                            lobbies[l].player2.socket.send(JSON.stringify({
                                winner: "tie",
                                letter: lobbies[l].currentLetter,
                                letterIndex: lobbies[l].clIndex,
                                score: lobbies[l].player2.score,
                                isYourTurn: false
                            }))
                            lobbies[l].player1.socket.send(JSON.stringify({
                                winner: "tie",
                                letter: lobbies[l].currentLetter,
                                letterIndex: lobbies[l].clIndex,
                                isYourTurn: true
                            }))
                            if (lobbies[l].player2.score == 0){
                                if (lobbies[l].player2.strikes == 3 && lobbies[l].player1.strikes != 3){
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
                                    lobbies[l].player1.socket.close()
                                    lobbies[l].player2.socket.close()
                                }
                            }
                        }
                    }
                    if (lobbies[l].player1Turn == true){lobbies[l].player1Turn = false}
                    else if(lobbies[l].player1Turn == false){lobbies[l].player1Turn = true}
                    
                }
            }
            if (l == lobbies.length-1 && messageFoundLobby == null){
                receiveSocketAndPlaceInLobby(ws, msg)
            }
        }
    })

    ws.on('close', function (msg) {
        console.log(`a client left`)
        for (s in sockets){
            if (sockets[s].socket == ws){
                clearInterval(looking)}
        }
        function clearAndDeleteLobby(){
            try {
                for (c in lobbies){
                    if (lobbies[c].player1.socket == ws){
                        lobbies[c].player2.socket.send(JSON.stringify({
                            opponentForfeit: true,
                            otherScore: lobbies[c].player1.totalScore
                        }))
                        lobbies[c].player2.socket.terminate()
                    }
                    if (lobbies[c].player2.socket == ws){
                        lobbies[c].player1.socket.send(JSON.stringify({
                            opponentForfeit: true,
                            otherScore: lobbies[c].player2.totalScore
                        }))
                        lobbies[c].player1.socket.terminate()
                    }
                } 
                lobbies = lobbies.filter(l => (l.player1.socket !== ws)) 

            } catch (error) {
                for (c in lobbies){
                    if (lobbies[c].player1.socket == ws){
                        lobbies[c].player2.socket.send(JSON.stringify({
                            opponentForfeit: true
                        }))
                        lobbies[c].player2.socket.terminate()
                    }
                    if (lobbies[c].player2.socket == ws){
                        lobbies[c].player1.socket.send(JSON.stringify({
                            opponentForfeit: true
                        }))
                        lobbies[c].player1.socket.terminate()
                    }
                lobbies = lobbies.filter(l => (l.player2.socket !== ws)) 
                }
            }
        }
        clearAndDeleteLobby()
        console.log(`current lobbies: ${lobbies.length}`)

        sockets = sockets.filter(s => s.socket !== ws)
        console.log(`current connections: ${sockets.length}`)

    })
})

app.use((req, res, next) => {
    res.status(404).sendFile('404.html', {root: 'public'})
})
  
app.use((err, req, res, next) => {
    console.error(err.stack)
    res.status(500).send('Something broke!')
})

app.listen(port, () => {
    console.log("app started")
})

async function dictionaryCall(input){
    try{
        let dictURL = `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${input}?key=${process.env.API_KEY}`
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
   