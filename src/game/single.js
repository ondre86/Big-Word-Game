const axios = require("axios")
const env = require("../env/index.js")
const ERR_DICTIONARY_API = new Error("error with dictionary api request")
const GAME_NAME = "Single Player" /*Likely keep in db*/
const GAME_DESCRIPTION = "Race against the clock!" /*Likely keep in db*/
const GAME_MAX_PLAYERS = 1
class Game {
    constructor(tutorialOn){
        this.buildDictionaryAPIUrl = (input) => `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${input}?key=${env.KEY}`
        this.started = undefined
        this.paused = undefined
        this.input = undefined
        this.finalWord = undefined
        this.t = 0
        this.wordCard = {
            word: undefined,
            type: undefined,
            defs: undefined,
            syllablesOther: undefined,
            syllablesCustom: undefined
        },
        this.foundClosest = false
        this.closest = undefined
        this.alpha = "abcdefghijklmnopqrstuvwxyz"
        this.aplhaX = 0
        this.getCurrentLetter = () => this.alpha[this.alphaX]
        this.currentLetter = ''
        this.isRandomOrder = false
        this.randomCounter = 0
        this.rounds = 1
        this.score = 0
        this.strikes = 0
        this.wordPlayed = false
        this.lost = false
        this.tutorialOn = !!tutorialOn 
        this.tpScore = false
        // GameRooms will bind `this` to a game to inherit game room properties as well
    }
    async AwaitAllLoaded(){
        while (this.players.length != this.playersReady.length) {
            await new Promise((resolve) => {
                setTimeout(resolve, 1 /*seconds*/ * 1000);
            });
        }
        return 
    }
    BeginGame(){
        this.startTimer()
    }
    AcceptAttempt(_, input){
        this.input = input
        this.callServerDictionary()
        return JSON.stringify(this.gameState())
    }
    EmitGameStates(){
        return JSON.stringify(this.gameState())
    }
    EndGame(){
        this.t = 11
        this.started = false
        return
    }
    RankPlayers(){
        return this.players
    }
    timer(){
        if (this.started = false) {
            return
        }
        if (this.paused == true) {
            setTimeout(this.timer, 250)
            return
        }
        if (this.t < 10) {
            this.t++
            setTimeout(this.timer, 1000)
            return
        }
    }
    togglePause(){
        this.paused = !this.paused
    }
    toggleTutorial() {
        this.tutorialOn = !this.tutorialOn
    }
    newGame() {
        this.tutorialOn = false
        this.started = true
        if (this.isRandomOrder == true){

        } else {
            this.alphaX = 0
        }
        this.currentLetter = this.getCurrentLetter()
    }
    resetTimer(){
        this.pause = false
        this.pausePress = false
        this.t = 0
    }
    stopTimerAndGame() {
        this.t = 0
        this.started = false
    }
    callServerDictionary(){
        if ((this.input == "" || this.input == null) && this.t < 10){}
        else if ((this.input == "" || this.input == null) && this.t == 11){ 
            this.strike() 
            this.foundClosest = false
            this.wordCard.word = "Ran Out of Time"
        }
        else {
            this.paused = true
            axios
            .get(this.buildDictionaryAPIUrl(this.input))
            .then((response) => response.json())
            .then((success) => {
                this.input = this.input.replace(/[^A-Za-z]/g, '').toLowerCase()
                this.setData(success)
                this.enterWord()
                this.input = ''
                this.paused = false
            })
            .catch(error => {
                throw ERR_DICTIONARY_API
            })
            }
    }
    enterWord(){
        this.resetTimer()
        try{
            if (toRaw(this.data.data[0].hwi) == undefined || this.data.data[0] == undefined){
                this.strike()
                this.wordCard.word = "Not a Word"
                if (typeof toRaw(this.data.data[0]) == "string"){
                    this.foundClosest = true
                    this.closest = toRaw(this.data.data[0])
                }
            }
            else if (toRaw(this.data.data[0].meta.id).includes("-") || toRaw(this.data.data[0].meta.id).includes(' ')){
                this.wordCard.word = "Try Again"
                this.wordCard.type = "word found in dictionary but contains spaces or dashes"
                this.wordCard.defs = null
                this.foundClosest = false
            }
            else{
                if (!this.isCurrentLetter()){
                    this.strike()
                    this.foundClosest = false
                    this.wordCard.word = "Wrong Starting Letter"
                }
                else if (this.isOffensive()){
                    this.strike()
                    this.foundClosest = false
                    this.wordCard.word = "Offensive"
                }
                else if (this.hasBeenUsed()){
                    this.strike()
                    this.foundClosest = false
                    this.wordCard.word = "Already Used"
                }
                else{
                    this.foundClosest = false
                    this.syllableCountCustom(this.input, toRaw(this.data.data))
                    this.wordCardUpdate(this.input, toRaw(this.data.data))
                    if(this.syllableLengthCheck()){
                        this.scoreKeeper()
                        this.nextLetter()
                        this.$refs.input.style.outlineColor = "green"
                        this.scroll()
                    }
                    else{
                        this.notLongEnough()
                        this.wordCard.word = "Too Short"
                    }
                }
            }
        } catch(error){
            this.strike()
            this.wordCard.word = "Not a Word"
        }
    }
    strike(){
        this.strikes++
        if (this.strikes == 3){
            this.finalWord = this.input
            this.lost = true
            this.wordCard.word = undefined
            this.wordCard.type = undefined
            this.wordCard.defs = undefined
            this.stopTimerAndGame()
        }
        else{
            this.resetTimer()
            this.wordCard.word = null
            this.wordCard.type = null
            this.wordCard.defs = null
        }
    }
    isOffensive(){
        return toRaw(this.data.data[0].meta.offensive)
    }
    isCurrentLetter(){
        this.currentLetter = this.alpha[this.alphaX]
        return this.input.split("")[0].toLowerCase() === this.alpha[this.alphaX]
    }
    hasBeenUsed(){
        return wordsList.has(this.input)
    }
    notLongEnough(){
        this.strike()
    }
    wordCardUpdate(input, data){
        for (let i = 0; i < data[0].meta.stems.length; i++){
            if (input == data[0].meta.stems[i].toLowerCase()){
                this.wordCard.word = data[0].meta.stems[i]
                this.wordCard.type = data[0].fl
                this.wordCard.defs = data[0].shortdef
            }
        }
    }
    syllableCountCustom(input, data){
        let stemSyllableArray = []
        for (let i = 0; i < data[0].meta.stems.length; i++){
            if (input == data[0].meta.stems[i]){
                if (data[0].hwi != undefined){
                    stemSyllableArray.push(data[0].hwi.hw.split("*"))
    
                    if(data[0].uros != undefined){
                        for (let x in data[0].uros){
                            stemSyllableArray.push(data[0].uros[x].ure.split("*"))
                        }
                    }
                    for (let v in stemSyllableArray){
                        if (stemSyllableArray[v].join("") == input){
                                this.wordCard.syllablesCustom = stemSyllableArray[v].length
                        }
                    }
                }
                else if (data[0].uros != undefined){
                    for (let g in data[0].uros){
                        stemSyllableArray.push(data[0].uros[g].ure.split("*"))
    
                        if (stemSyllableArray[g].join("") == input){
                            this.wordCard.syllablesCustom = stemSyllableArray[g].length
                        }
                    }
                }
            }
        }
    }
    syllableLengthCheck(){
        // FAIL
        if (toRaw(this.wordCard.syllablesCustom) < 3 && toRaw(this.wordCard.syllablesOther) < 3){
            return this.wordPlayed = false
        }
        // SUCCESS
        // NULL CASE
        else if(toRaw(this.wordCard.syllablesCustom) == null && toRaw(this.wordCard.syllablesOther) != null && toRaw(this.wordCard.syllablesOther) >= 3){
            this.wordListUpdate()
            this.tpScore = true
            return this.wordPlayed = true
        }
        // CUSTOM FAIL, THIRD PARTY SUCCEED
        else if(toRaw(this.wordCard.syllablesCustom) < 3 && toRaw(this.wordCard.syllablesOther) >=3 ){
            this.wordListUpdate()
            this.tpScore = true
            return this.wordPlayed = true
        }
        // CUSTOM SUCCEED, THIRD PARTY FAIL
        else if(toRaw(this.wordCard.syllablesCustom) >= 3 && toRaw(this.wordCard.syllablesOther) < 3){
            return this.wordPlayed = false
        }
        // BOTH GREATER THAN 3, THIRD PARTY LARGER
        else if ((toRaw(this.wordCard.syllablesCustom) >= 3 && toRaw(this.wordCard.syllablesOther) >= 3) && ((toRaw(this.wordCard.syllablesOther) > toRaw(this.wordCard.syllablesCustom)))){
            this.wordListUpdate()
            this.tpScore = true
            return this.wordPlayed = true
        }
        // BOTH GREATER THAN 3, CUSTOM LARGER
        else if ((toRaw(this.wordCard.syllablesCustom) >= 3 && toRaw(this.wordCard.syllablesOther) >= 3) && (toRaw(this.wordCard.syllablesOther) < toRaw(this.wordCard.syllablesCustom))){
            this.wordListUpdate()
            this.customScore = true
            return this.wordPlayed = true
        }
        // CUSTOM EQUAL TO THIRD PARTY & BOTH GREATER THAN 3, SUCCEED
        else if ((toRaw(this.wordCard.syllablesCustom) >= 3 && toRaw(this.wordCard.syllablesOther) >= 3) && (toRaw(this.wordCard.syllablesCustom) == toRaw(this.wordCard.syllablesOther))){
            this.wordListUpdate()
            this.tpScore = true
            return this.wordPlayed = true
        }
    } 
    wordListUpdate(){
        this.wordPlayed = true
        wordsList.add(toRaw(this.wordCard.word))
    }
    scoreKeeper(){
        if (this.wordPlayed && this.tpScore){
            this.score += this.wordCard.syllablesOther
        }
        else if (this.wordPlayed && this.customScore){
            this.score += this.wordCard.syllablesCustom
        }
        if (this.score > this.cookieHighScore){
            this.newHighScore = true
        }
    }
    nextLetter() {
        if (this.isRandomOrder == true){
            if (this.randomCounter == 26){
                this.rounds++
                this.randomCounter = 0
                this.alphaX = Math.floor(Math.random() * 26)
                this.currentLetter = this.alpha[this.alphaX]
            }
            else {
                this.randomCounter++
                this.alphaX = Math.floor(Math.random() * 26)
                this.currentLetter = this.alpha[this.alphaX]
            }
        }
        else{
            if (this.alphaX == 25){
                this.alphaX = 0
                this.currentLetter = this.alpha[this.alphaX]
                this.rounds++
            }
            else{
                this.alphaX++
                this.currentLetter = this.alpha[this.alphaX]
            }
        }
        this.tpScore, this.customScore = false
        this.wordPlayed = false
    }
    gameState(){
        return {
            started: this.started,
            paused: this.paused,
            t: this.t,
            wordCard: this.wordCard,
            foundClosest: this.foundClosest,
            closest: this.closest,
            currentLetter: this.currentLetter,
            score: this.score,
            strikes: this.strikes,
            wordPlayed: this.wordPlayed,
            lost: this.lost,
            tutorialOn: this.tutorialOn,
            tpScore: this.tpScore,
            // GameRoom State
            gameRoom: {
                id: this.id,
                shortName: this.shortName,
                createdAt: this.createdAt,
                closesAt: this.closesAt,
            }
        }
    }
}


module.exports = {}
module.exports.ERR_DICTIONARY_API = ERR_DICTIONARY_API
module.exports.GAME_NAME = GAME_NAME
module.exports.GAME_DESCRIPTION = GAME_DESCRIPTION
module.exports.GAME_MAX_PLAYERS = GAME_MAX_PLAYERS
module.exports.Game = Game