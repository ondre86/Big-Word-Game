const { toRaw } = Vue
function $(elem){
    return document.querySelectorAll(elem)
}

const app = Vue.createApp({
    data() {
        return {
            started: null,
            paused: false,
            pausePress: false,
            pauseScroll: false,
            startBtn: null,
            tutBtn: null,
            lost: null,
            tutorialOn: false,
            introOff: false,
            data: null,
            input: '',
            finalWord: '',
            t: 15,
            wordCard:{
                word: null,
                type: null,
                defs: null,
                syllablesOther: null,
                syllablesCustom: null,
            },
            wordCardOutlineColor: "#B79E01",
            foundClosest: false,
            closest: null, 
            alpha: "abcdefghijklmnopqrstuvwxyz".split(''),
            alphaX: 0,
            currentLetter: '',
            isRandomOrder: false,
            randomCounter: 0,
            rounds: 1,
            score: 0,
            cookieScore: 0,
            cookieHighScore: 0,
            newHighScore: null,
            strikes: 0,
            wordPlayed: false,
            wordsList: new Set(),
            vWordsScrolled: [],
            vWordsOBJList: [],
            customScore:tpScore = null,
            input: null,       
            time: null,
            tries: 0,

            wordMsg: '',

            mode: '',
            modeDescriptor: '',
            order: 'default',
            classicModeOn: false,

            hasUsername: false,
            usernameInput: '',
            mpUsername: '',
            usernameError: null,
            changingUsername: null,
            mpUserTimestamp: null,

            chosenMatchmakingMode: false,
            joiningParty: false,
            wantsToCreateParty: false,
            partyLeaderUsername: '',
            inParty: false,
            isPartyLeader: false,
            partyMemberUsername: ' ',

            multiPlayer: false, 
            mpClassicTut: false,
            mpSpeedTut: false,
            mpBattleTut: false,
            mpCTisHidden: true,
            mpSTisHidden: true,
            mpWTisHidden: true,

            webSocket: null,
            isWaiting: false,
            waitingDots: null,
            inGameWaitingMsg: null,
            countingDown: false,
            countdown: 5,
            mpCountdownToGameStart: null,
            opponentName: '',

            mpLost: null,
            mpTie: null,
            mpLostReason: null,
            mpFinalScore: null,
            autoSent: false,
            opponentScore: 0
        }
    },
    methods: {
        // PATH BRANCHING & TUTORIALS
        tutorialToggle(){
            if(this.tutorialOn){
                this.tutorialOn = false
            }
            else{
                this.tutorialOn = true
            }
        },
        twoPlayer(){
            if(this.multiPlayer && !this.lost){
                this.multiPlayer = false
                navigator.sendBeacon("/", JSON.stringify({
                    username: this.mpUsername,
                    partyLeaderUsername: this.partyLeaderUsername ? this.partyLeaderUsername : null,
                    request: "leave"
                }))
            }
            else {
                this.multiPlayer = true
                if (localStorage.username){
                    this.usernameInput = localStorage.username
                    this.$refs.userInput.value = localStorage.username
                    this.hasUsername = true
                }
                this.setUsername()
            }

            if(this.introOff){this.introOff = false}
            else {this.introOff = true}
        },
        mpCTHide(){
            if (!this.mpCTisHidden){this.mpCTisHidden = true}
            else{this.mpCTisHidden = false}
        },
        mpSTHide(){
            if (!this.mpSTisHidden){this.mpSTisHidden = true}
            else{this.mpSTisHidden = false}
        },
        mpWTHide(){
            if (!this.mpWTisHidden){this.mpWTisHidden = true}
            else{this.mpWTisHidden = false}
        },
        classicTutToggle(){
            if (!this.mpClassicTut){this.mpClassicTut = true}
            else{this.mpClassicTut = false}
        },
        speedTutToggle(){
            if (!this.mpSpeedTut){this.mpSpeedTut = true}
            else{this.mpSpeedTut = false}
        },
        battleTutToggle(){
            if (!this.mpBattleTut){this.mpBattleTut = true}
            else{this.mpBattleTut = false}
        },
        backToHome(){
            this.mpClassicTut = false
            this.classicModeOn = false
            this.mpSpeedTut = false
            this.mpBattleTut = false
            this.multiPlayer = false
            this.chosenMatchmakingMode = false
            this.joiningParty = false
            this.lost = false
            this.introOff = false
            this.scrollToTop()
        },
        mpBackToHome(otherScore, reason){
            this.mpClassicTut = false
            this.classicModeOn = false
            this.mpSpeedTut = false
            this.mpBattleTut = false
            this.introOff = false
            this.chosenMatchmakingMode = false
            this.mode = ''
            this.opponentScore = otherScore
            this.mpLostReason = reason
            this.scrollToTop()
        },
        chooseMatchmakingMode(type){
            switch (type) {
                case 'random':
                    this.chosenMatchmakingMode = true
                    break
                case 'leader':
                    this.wantsToCreateParty = true
                    this.chosenMatchmakingMode = true
                    console.log(this.wantsToCreateParty)
                    fetch('/', {
                        method: 'POST',
                        headers: {
                            "Content-Type": 'application/json'
                        },
                        body: JSON.stringify({
                            username: this.mpUsername,
                            partyRequest: "create"
                        })
                    })
                    .then(res => res.json())
                    .then(res => this.isPartyLeader = res.createdNewParty)
                    .then(() => {
                        if (this.isPartyLeader){
                            this.startWebSocket()
                        }
                        else {
                            this.usernameErrorMSG("Party could not be created.")
                        }
                    })
                    break
                case 'member':
                    this.joiningParty = true
                    break
            }
        },

        // STARTING A GAME
        newGame() {
            this.tutorialOn = false
            this.started = true
            if (this.isRandomOrder){}
            else{this.alphaX = 0}
            this.currentLetter = this.alpha[this.alphaX]
            this.resetTimer()
        },
        mpClassicNewGame(){
            this.started = true
            if (this.isRandomOrder){}
            else{this.alphaX = 0}
            this.currentLetter = this.alpha[this.alphaX]
        },
        shrinkHeader(){
            gsap.to(["#logo"], {
                height: "0px",
                margin: "0px",
                padding: "0px",
                duration: .5
            })
            gsap.to("header", {
                margin: "0px auto",
                height: "0px",
                duration: .5
            }, "<")
        },
        expandHeader(){
            gsap.to(["#logo"], {
                height: "60px",
                duration: .5
            })
            gsap.to("header", {
                margin: "0.5rem auto 1rem",
                height: "67px",
                duration: .5
            }, "<")
        },

        // RESETS
        quit(){
            this.started = false
            this.tutorialOn = false
            this.backToHome()
            this.expandHeader()

            if (this.webSocket){
                this.terminateWS()
            }

            if (this.score > this.cookieHighScore){
                this.newHighScore = true
                this.cookieScore = this.score
                localStorage.setItem("highScore", `${this.score}`)
            }
            
            this.cookieScore = localStorage.lastScore ? localStorage.lastScore : 0
            this.cookieHighScore = localStorage.highScore || this.cookieHighScore !== '' ? localStorage.highScore : 0

            this.resetStats()
        },
        resetStats(){
            this.paused = false
            this.lost = null
            this.currentLetter = ''
            this.finalWord = ''
            this.input = ''
            this.randomCounter = 0
            this.wordsList.clear()
            this.vWordsScrolled = []
            this.vWordsOBJList = []
            this.score = 0
            this.newHighScore = false
            this.strikes = 0
            this.wordPlayed = false
            this.customScore, this.tpScore = null
            this.wordCard.word = null
            this.wordCard.type = null
            this.wordCard.defs = null
            this.wordCard.syllablesOther = null
            this.wordCard.syllablesCustom = null
            this.foundClosest = false,
            this.closest = null
            this.$refs.input.style.outlineColor = this.wordCardOutlineColor
            clearInterval(this.time)
            this.time = null

            this.chosenMatchmakingMode = false,
            this.mpLost = null
            this.mpTie = null
            this.mpLostReason = null
            this.mpFinalScore = null
            this.autoSent = false
        },
        resetPlaceholder(){
            clearInterval(this.inGameWaitingMsg)
            this.$refs.input.style.textAlign = "left"
            this.$refs.input.placeholder = ''
        },
        resetWaiting(){
            this.isWaiting = false
            clearInterval(this.waitingDots)
            if($("#waiting-text")[0]){
                $("#waiting-text")[0].textContent = 'finding an opponent'
            }
        },

        // TIMER & PAUSING
        isInViewport() {
            const rect = this.$refs.input.getBoundingClientRect()
            if (
                rect.top >= -30 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            )
                {
                    this.pauseScroll = false

                    if (this.pausePress){}
                    else{
                        this.paused = false
                    }
                    return true
                }
            else {
                if (!this.multiPlayer){
                    this.pauseScroll = true
                    this.paused = true
                    return false
                }
                else return true
            }
        },
        pause(){
            if (!this.pausePress){
                this.pausePress = true

                if (this.paused){
                    this.$refs.input.disabled = true
                }
                else{
                    this.paused = true
                    this.$refs.input.disabled = true
                }
            }
            else {
                this.pausePress = false
                
                if (this.pauseScroll){
                    this.$refs.input.disabled = false
                }
                else{
                    this.paused = false
                    this.$refs.input.disabled = false
                    this.$refs.input.focus()
                }
            }
        },
        timer(){
            if (this.isInViewport() && !this.paused && this.started){            
                if (this.t > 0){
                    this.t--
                    this.$refs.input.disabled = false
                }
                if (this.t == 0 && this.strikes != 3){
                    this.$refs.input.disabled = true
                    this.autoSent = true
                    this.callServerDictionary() 
                }
                else if(this.t == 0 && this.strikes == 3){
                    this.stopTimerAndGame()
                }
            }
            else {}
        },
        startTimer(){
            if (this.strikes == 3){
                this.started = false
                this.resetStats()
                this.newGame()
            }
            else{
                this.resetStats()
                this.newGame()
            }
        },
        resetTimer(){
            clearInterval(this.time)
            this.paused = false
            this.pausePress = false
            if (this.started){
                this.$refs.input.disabled = false
                this.$refs.input.focus()
            }
            else {}
            this.$refs.input.focus()
            this.t = 15
            this.time = setInterval(this.timer, 1000)
        },
        mpStopTimer(){
            clearInterval(this.time)
            this.paused = true
            this.$refs.input.disabled = true
        },
        mpResetTimer(){
            clearInterval(this.time)
            this.$refs.input.disabled = false
            this.paused = false
            this.$refs.input.focus()
            this.t = 15
            this.time = setInterval(this.timer, 1000)
        },
        mpRefreshTimer(){
            if (this.classicModeOn){}
            else {
                this.mpStopTimer()
                this.mpResetTimer()
            }
        },
        stopTimerAndGame(){
            clearInterval(this.time)
            this.t = 15
            this.started = false
            this.introOff = false
        },

        // GAME & WORD LOGIC
        async callServerDictionary(event){
            this.scrollToTop()
            if (event){event.preventDefault()}
            if ((this.input == '' || !this.input || this.input.replace(/[^A-Za-z]/g, '').length == 0) && this.t > 0){return}
            if ((event != undefined || event != null) && this.t <= 1){}
            else if ((this.input == '' || !this.input) && this.t == 0){ 
                this.autoSent = false
                this.strike() 
                this.foundClosest = false
                this.wordCard.word = "Ran Out of Time"
            }
            else {
                if (this.t != 0){this.autoSent = false}
                else {this.autoSent = true}
                this.paused = true
                fetch('/', {
                    method: 'POST',
                    headers: {
                        "Content-Type": 'application/json'
                    },
                    body: JSON.stringify({
                        input: this.input.replace(/[^A-Za-z]/g, '')
                    })
                })
                .then((rep) => rep.json())
                .then((success) => {
                    this.input = this.input.replace(/[^A-Za-z]/g, '').toLowerCase()
                    if (this.input.replace(/[^A-Za-z]/g, '').length == 0){
                        this.autoSent = false
                        this.strike() 
                        this.foundClosest = false
                        this.wordCard.word = "Invalid Input"
                    }
                    else {
                        this.setData(success)
                        this.enterWord()
                        this.input = ''
                        this.$refs.input.focus()
                        this.$refs.input.click()
                    }
                })
                .then(()=>{
                    if (!this.multiPlayer){
                        this.resetTimer()
                    }
                    else {
                        this.mpStopTimer()
                        this.t = 15
                        if (this.multiPlayer && !this.classicModeOn){this.animateWaitingMsg()}
                    }
                })
                .catch(error => {
                    alert("Sorry, there was a problem communicating with our server.")
                })
            }
        },   
        setData(item){
            this.data = item
            this.wordCard.syllablesOther = item.tps
        },  
        enterWord(){
            this.tries++
            try{
                if (this.input == ''){}
                else if (!this.data.data[0] || !toRaw(this.data.data[0].hwi)){
                    if (toRaw(this.data.data[0]) && toRaw(this.data.data[0]) !== ''){
                        this.foundClosest = true
                        this.closest = toRaw(this.data.data[0])
                        this.finalWord = this.closest
                    }
                    else {this.foundClosest = false}
                    this.strike()
                    this.wordCard.word = "Not a Word"
                }
                else if (toRaw(this.data.data[0].meta.id).includes("-") || toRaw(this.data.data[0].meta.id).includes(' ')){
                    this.strike()
                    this.wordCard.word = "No Two-Part Words"
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
                            if (this.webSocket){
                                if (this.wordPlayed && this.tpScore){
                                    this.webSocket.send(JSON.stringify({
                                        score: this.wordCard.syllablesOther,
                                        time: Date.now(),
                                        word: this.wordCard,
                                        strikes: this.strikes,
                                        autoSent: this.autoSent
                                    }))
                                }
                                else if (this.wordPlayed && this.customScore){
                                    this.webSocket.send(JSON.stringify({
                                        score: this.wordCard.syllablesCustom,
                                        time: Date.now(),
                                        word: this.wordCard,
                                        strikes: this.strikes,
                                        autoSent: this.autoSent
                                    }))
                                }
                            }
                            else {
                                this.scoreKeeper()
                                this.nextLetter()
                                this.$refs.input.style.outlineColor = "green"
                                this.scrollWordCardList()
                            }
                        }
                        else{
                            this.notLongEnough()
                            this.wordCard.word = "Too Short"
                        }
                    }
                }
            } catch(error){
                this.strike()
                this.foundClosest = false
                this.wordCard.word = "Not a Word"
            }
        },
        strike(){
            this.strikes++
            this.$refs.input.style.outlineColor = "red"
            if (!this.classicModeOn){
                this.cycleWordMessage(0)
            }
            else{
                this.cycleWordMessageClassic(0)
            }
             
            if (this.webSocket){
                this.webSocket.send(JSON.stringify({
                    score: 0,
                    time: Date.now(),
                    word: null,
                    strikes: this.strikes,
                    autoSent: this.autoSent
                }))
            }
            if (this.strikes == 3){
                this.finalWord = this.$refs.input.value

                this.wordCard.word = null
                this.wordCard.type = null
                this.wordCard.defs = null
                localStorage.setItem("lastScore", `${this.score}`)
                if (this.score > this.cookieHighScore){
                    this.newHighScore = true
                    localStorage.setItem("highScore", `${this.score}`)
                }
                else{
                    this.newHighScore = false
                }
                if (this.webSocket){}
                else {
                    this.lost = true
                    this.stopTimerAndGame()
                }
            }
            else{
                if (!this.multiPlayer){
                    this.resetTimer()
                }
                else { 
                    this.mpStopTimer() 
                    if (this.classicModeOn){}
                    else {this.mpResetTimer()}
                }
                this.wordCard.word = null
                this.wordCard.type = null
                this.wordCard.defs = null
            }
        },
        isOffensive(){
            return toRaw(this.data.data[0].meta.offensive)
        },
        isCurrentLetter(){
            this.currentLetter = this.alpha[this.alphaX]
            return this.input.split('')[0].toLowerCase() == this.alpha[this.alphaX].toLowerCase()
        },
        hasBeenUsed(){
            if (this.wordsList.has(this.input) || this.wordsList.has(this.input.charAt(0).toUpperCase() + this.input.slice(1))){
                for (let f = 0; f < this.$refs.wl.children.length; f++){
                    if (this.$refs.wl.children[f].innerHTML.includes(this.input) || this.$refs.wl.children[f].innerHTML.includes(this.input.charAt(0).toUpperCase() + this.input.slice(1))){
                        gsap.to(this.$refs.wl, {
                            scrollTo: {y: 0, x: (this.$refs.wl.children[f].offsetLeft - (this.$refs.wl.clientWidth / 2) + (this.$refs.wl.children[f].clientWidth / 2)), autokill: true},
                            duration: .5
                        })
                        this.$refs.wl.children[f].children[0].classList.add("active")
                        setTimeout(() => {
                            this.$refs.wl.children[f].children[0].classList.remove("active")
                        }, 2500)
                    }
                }
                return true
            }
            else return false
        },
        notLongEnough(){
            this.strike()
        }, 
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
                            if (stemSyllableArray[v].join('') == input){
                                    this.wordCard.syllablesCustom = stemSyllableArray[v].length
                            }
                        }
                    }
                    else if (data[0].uros != undefined){
                        for (let g in data[0].uros){
                            stemSyllableArray.push(data[0].uros[g].ure.split("*"))
                            if (stemSyllableArray[g].join('') == input){
                                this.wordCard.syllablesCustom = stemSyllableArray[g].length
                            }
                        }
                    }
                }
            }
        },
        syllableLengthCheck(){
            // FAIL
            if (toRaw(this.wordCard.syllablesCustom) < 3 && toRaw(this.wordCard.syllablesOther) < 3){
                return this.wordPlayed = false
            }
            // SUCCESS
            // CUSTOM CHECK NULL CASE & THIRD PARTY SUCCEED
            else if(toRaw(!this.wordCard.syllablesCustom) && toRaw(this.wordCard.syllablesOther) && toRaw(this.wordCard.syllablesOther) >= 3){
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
                // IF GAP BETWEEN TWO COUNTS IS VERY WIDE, I'LL FAVOR THE THIRD PARTY CHECK
                if (this.wordCard.syllablesCustom - this.wordCard.syllablesOther > 1){
                    return this.wordPlayed = false
                } else {
                    this.wordListUpdate()
                    this.customScore = true
                    return this.wordPlayed = true
                }
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
        }, 

        // DOM UPDATES AND WORD INFO
        wordCardUpdate(input, data){
            for (let i = 0; i < data[0].meta.stems.length; i++){
                if (input == data[0].meta.stems[i].toLowerCase()){
                    this.wordCard.word = data[0].meta.stems[i]
                    this.wordCard.type = data[0].fl
                    this.wordCard.defs = data[0].shortdef
                }
            }
            if (!this.multiPlayer){
                if(this.wordCard.defs != null){
                    this.vWordsOBJList.push(Object.values(toRaw(this.wordCard)))  
                }
            }
        },
        mpWordCardUpdate(word){
            if (word && word.word){toRaw(this.wordCard).word = word.word}
            if (word && word.type){toRaw(this.wordCard).type = word.type}
            if (word && word.defs){toRaw(this.wordCard).defs = word.defs}
            if (word && word.syllablesOther){toRaw(this.wordCard).syllablesOther = word.syllablesOther}
            if (word && word.syllableCountCustom){toRaw(this.wordCard).syllablesCustom = word.syllablesCustom}
        },
        replaceWordCard(event){
            this.finalWord = ''
            for (let e = 0; e < this.$refs.wl.children.length; e++){
                this.$refs.wl.children[e].childNodes[0].classList.remove("active")
                if (event.target.innerHTML == toRaw(this.vWordsOBJList[e][0])){
                    event.target.classList.add("active")
                    this.wordCard.word = toRaw(this.vWordsOBJList[e][0])
                    this.wordCard.type = toRaw(this.vWordsOBJList[e][1])
                    this.wordCard.defs = toRaw(this.vWordsOBJList[e][2])
                }
            }
            gsap.to(this.$refs.wl, {
                scrollTo: {y: 0, x: (event.target.offsetLeft - (this.$refs.wl.clientWidth / 2) + (event.target.clientWidth / 2)), autokill: true},
                duration: .5
            })
            gsap.to(this.$refs.wcScroller, {
                scrollTo: 0,
                duration: .5
            })
        },
        wordListUpdate(){
            if (!this.multiPlayer){
                this.wordPlayed = true
                this.wordsList.add(toRaw(this.wordCard.word))
            }
        },
        mpWordListUpdate(){
            if (!this.$refs.wl.children[0]){
                const first = document.createElement("li")
                first.innerHTML = `<button class="btn font2"></button>`
                first.addEventListener("click", ()=>{
                    this.replaceWordCard()
                })
                first.addEventListener("keydown", (e)=>{
                    if (e.keyCode === 32){
                        this.replaceWordCard()
                    }
                    if (e.keyCode === 13){
                        this.replaceWordCard()
                    }
                }) 
            }
            this.wordPlayed = true
            this.wordsList.add(toRaw(this.wordCard.word)) 
            if(this.wordCard.defs != null){
                this.vWordsOBJList.push(Object.values(toRaw(this.wordCard)))  
            }
        },
        cycleWordMessage(m){
            if (!this.classicModeOn){
                if (!m || m < 3){
                    this.wordMsg = '❌'
                }
                else this.wordMsg = '✅'
            }
            
            this.animateWordMsg()
        },
        cycleWordMessageClassic(m){
            if (this.classicModeOn){
                if (!m || m < 3){
                    this.wordMsg = '❌'
                }
                else this.wordMsg = '✅'
            }
            
            this.animateWordMsg()
        },
        mpWordMsg(){
            if (!this.classicModeOn){
                this.wordMsg = '🔁'
            }
            this.animateWordMsg()
        },
        animateWordMsg(){
            wm = gsap.timeline()
            .fromTo(this.$refs.wordMsg, {
                y: "100%",
                opacity: 0
            }, {
                y: "0%",
                opacity: 1,
                duration: 0.5,
            })
            .to(this.$refs.wordMsg, {
                y: "100%",
                opacity: 0,
                duration: .5
            }, "<+=2")
        },
        animateWaitingMsg(){
            clearInterval(this.inGameWaitingMsg)
            this.$refs.input.style.textAlign = "center"
            let msg = 'waiting'
            let dots = 0
            this.$refs.input.placeholder = msg
            this.inGameWaitingMsg = setInterval(()=>{
                dots++
                msg = msg.concat(".")
                this.$refs.input.placeholder = msg
                if (dots == 4){
                    dots = 0
                    msg = 'waiting'
                    this.$refs.input.placeholder = msg
                }
            }, 1000)
        },
        emphasizeWordCard(){
            wcOutline = gsap.timeline()
            .to(this.$refs.wordCardDisplay, {
                outline: `9px solid ${this.wordCardOutlineColor}`,
                duration: .5
            })
            .to(this.$refs.wordCardDisplay, {
                outline: `0px solid ${this.wordCardOutlineColor}`,
                duration: .5
            }, "<+=2")
        },
        emphasizeInput(isWinner, score = this.wordCard.syllablesOther){
            if (isWinner){
                this.$refs.input.style.outlineColor = "green"
            }
            else {
                if (score != 0){
                    this.$refs.input.style.outlineColor = this.wordCardOutlineColor
                }
            }
        },

        // SCORE
        scoreKeeper(){
            if (this.wordPlayed && this.tpScore){
                if (!this.classicModeOn){
                    this.cycleWordMessage(this.wordCard.syllablesOther)
                }
                this.score += this.wordCard.syllablesOther
                this.cookieScore = this.score
                localStorage.setItem("lastScore", `${this.score}`)
            }
            else if (this.wordPlayed && this.customScore){
                if (!this.classicModeOn){
                    this.cycleWordMessage(this.wordCard.syllablesCustom)
                }
                this.score += this.wordCard.syllablesCustom
                this.cookieScore = this.score
                localStorage.setItem("lastScore", `${this.score}`)
                
            }
            if (this.score > this.cookieHighScore){
                this.newHighScore = true
                this.cookieScore = this.score
                localStorage.setItem("highScore", `${this.score}`)
            }
        },
        mpScoreFinal(s){
            localStorage.setItem("lastScore", `${s}`)
            if (s > this.cookieHighScore){
                this.newHighScore = true
                localStorage.setItem("highScore", `${s}`)
            }
        },

        // LETTER ORDER
        randomOrder(boolean){
            if (!boolean){{
                this.isRandomOrder = false
                this.order = "default"
                this.alphaX = 0
                this.currentLetter = this.alpha[this.alphaX]
            }}
            else{
                this.isRandomOrder = true
                this.order = "random"
                if (!this.multiPlayer){
                    this.alphaX = Math.floor(Math.random() * 26)
                    this.currentLetter = this.alpha[this.alphaX]
                }
            }
        },
        nextLetter() {
            if (this.isRandomOrder){
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
            this.$refs.input.focus()
        },
        mpNextLetter(letter, index){
            this.alphaX = index
            if (!letter){
                this.currentLetter = this.alpha[index]
            }
            else {this.currentLetter = letter}
            this.tpScore, this.customScore = false
            this.wordPlayed = false
            this.$refs.input.focus()
        },

        // SCROLLING
        scrollWordCardList(){
            setTimeout(() => {
                if (!this.$refs.wl.children[this.$refs.wl.children.length-1]){}
                else {
                    this.vWordsScrolled.push(this.$refs.wl.children[this.$refs.wl.children.length-1].scrollWidth)
                    gsap.to(this.$refs.wl, {
                        scrollTo: {y: 0, x: this.$refs.wl.scrollWidth, autokill: true},
                        duration: .5
                    })
                }
            }, 100)
        },
        scrollToTop(){
            gsap.to("body", {
                scrollTo: {y:0, x:0, autokill: true},
                duration: .5,
                ease: "power4.out"
            })
            if (this.$refs.wcScroller){
                gsap.to(this.$refs.wcScroller, {
                    scrollTo: 0,
                    duration: .5
                })
            }
        },


        // MP USERNAMES
        setUsername(event){
            if (event) {event.preventDefault()}

            if (this.usernameInput == '' || !this.$refs.userInput.value){
                this.usernameErrorMSG("Username cannot be blank.")
            }
            else {
                this.mpUsername = this.usernameInput.replace(/[^a-zA-Z0-9]/g, '')
                this.mpUserTimestamp = Date.now()
                fetch('/', {
                    method: 'POST',
                    headers: {
                        "Content-Type": 'application/json'
                    },
                    body: JSON.stringify({
                        oldUsername: localStorage.username,
                        oldJoinDate: localStorage.usernameDate,
                        username: this.mpUsername,
                        joinDate: this.mpUserTimestamp,
                        request: "join"
                    })
                })
                .then((rep) => rep.json())
                .then((rep) => {
                    if (!rep.registered){
                        this.hasUsername = false
                        if (!this.changingUsername){
                            this.mpUsername = ''
                        }   
                        if (rep.profane){
                            this.usernameErrorMSG("No profanity allowed.")
                        }  
                        else{
                            this.usernameErrorMSG("Username taken.")
                        }               
                    }
                    else {
                        if (!this.hasUsername){
                            this.hasUsername = true
                        }
                        localStorage.setItem("username", this.mpUsername)
                        localStorage.setItem("usernameDate", this.mpUserTimestamp)
                        this.$refs.userInput.value = ''
                        this.usernameInput = ''
                    }
                })
            }
        },
        usernameErrorMSG(error) {
            if (this.usernameError){
                this.usernameError.innerHTML = `${error} <br> Try again.`
            }
            else{
                this.$refs.userInput.style.outlineColor = "red"
                this.usernameError = document.createElement("span")
                this.usernameError.classList.add("font-2", "txt-center")
                this.usernameError.setAttribute("id", "username-error")
                this.usernameError.innerHTML = `${error} <br> Try again.`
            }

            $("#username-section")[0].children[1].append(this.usernameError)
        },
        joinPartyByUsername(event){
            if (event) {event.preventDefault()}

            if (this.usernameInput == '' || !this.$refs.userInput.value){
                this.usernameErrorMSG("Username cannot be blank.")
            }
            else {
                this.partyLeaderUsername = this.usernameInput.replace(/[^a-zA-Z0-9]/g, '')
                fetch('/', {
                    method: 'POST',
                    headers: {
                        "Content-Type": 'application/json'
                    },
                    body: JSON.stringify({
                        username: this.mpUsername,
                        partyLeaderUsername: this.partyLeaderUsername,
                        partyRequest: "join"
                    })
                })
                .then((rep) => rep.json())
                .then((rep) => {
                    if (!rep.joinedParty){
                        if (rep.inactive) {
                            this.usernameErrorMSG("User has no active party.")
                        }
                        if (rep.duplicate){
                            this.usernameErrorMSG("Cannot join own party.")
                        }
                        if (rep.full){
                            this.usernameErrorMSG("Party is full.")
                        }    
                    }
                    else {
                        this.inParty = true
                        this.startWebSocket()
                    }
                })
            }
        },
        deleteParty(){
            this.webSocket.send(JSON.stringify({
                username: this.mpUsername,
                partyRequest: "delete"
            }))
            this.wantsToCreateParty = false
            this.isPartyLeader = false
            this.chosenMatchmakingMode = false
            this.partyMemberUsername = ' '
        },
        leaveParty(){
            this.webSocket.send(JSON.stringify({
                username: this.mpUsername,
                partyLeader: this.partyLeaderUsername,
                partyRequest: "leave"
            }))
            this.inParty = false
            this.joiningParty = false
            this.isWaiting = false
            this.chosenMatchmakingMode = false
        },
    
        // MP WEBSOCKETS GAME LOGIC
        startWebSocket(){
            this.determineMode()

            if (!this.webSocket){
                this.webSocket = new WebSocket(`wss://${window.location.hostname}:${window.location.port}`)

                // OPENING MESSAGE
                this.webSocket.addEventListener("open", (event) => {
                    if (this.inParty){
                        this.webSocket.send(JSON.stringify({
                            username: this.mpUsername,
                            inParty: this.inParty,
                            partyLeader: this.partyLeaderUsername
                        }))
                    }
                    if (this.isPartyLeader){
                        this.webSocket.send(JSON.stringify({
                            username: this.mpUsername,
                            isPartyLeader: this.isPartyLeader,
                        }))
                    }
                    else {
                        if (this.mode != ''){
                            this.webSocket.send(JSON.stringify({
                                mode: this.mode,
                                order: this.order,
                                username: this.mpUsername
                            }))
                        }
                    }
                })
                // RECEIVE GAME EVENTS FROM SERVER
                this.webSocket.addEventListener("message", (event) => {
                    rep = JSON.parse(event.data)
                    
                    // WAITING FOR MATCH
                    if (rep.waiting){
                        this.isWaiting = true
                        if (this.inParty){
                            this.waitingDots = setInterval(() => {
                                $("#waiting-text")[0].textContent += "."
                                if ($("#waiting-text")[0].textContent == 'waiting for leader....'){
                                    $("#waiting-text")[0].textContent = 'waiting for leader'
                                }
                            }, 1000)
                        }
                        else{
                            this.waitingDots = setInterval(() => {
                                $("#waiting-text")[0].textContent += "."
                                if ($("#waiting-text")[0].textContent == 'finding an opponent....'){
                                    $("#waiting-text")[0].textContent = 'finding an opponent'
                                }
                            }, 1000)
                        }
                    }
                    if (rep.partyMemberUsername){
                        this.partyMemberUsername = rep.partyMemberUsername
                    }
                    // PLACED IN GAME
                    else if (!rep.waiting && rep.inGame){
                        if (rep.isClassic){
                            this.classicModeOn = true
                        }
                        this.determineMode(rep.mode)
                        clearInterval(this.waitingDots)

                        this.opponentName = rep.opponent
                        this.countingDown = true
                        this.mpCountdownToGameStart = setInterval(() => {
                            this.countdown--
                            if (this.countdown == 0){
                                clearInterval(this.mpCountdownToGameStart)
                                this.countdown = 5
                                this.countingDown = false

                                this.resetStats()

                                if (this.classicModeOn){
                                    this.mpClassicNewGame()
                                    if (rep.isYourTurn){
                                        this.mpResetTimer()
                                        this.resetPlaceholder()
                                        clearInterval(this.inGameWaitingMsg)
                                    }
                                    else{
                                        this.mpStopTimer()
                                        this.animateWaitingMsg()
                                    }
                                }
                                else {
                                    this.newGame()
                                    this.resetPlaceholder()
                                    clearInterval(this.inGameWaitingMsg)
                                }
                                this.isWaiting = false
                                this.mpNextLetter(rep.letter, rep.letterIndex)
                            }
                        }, 1000)
                    }

                    // INPUT BEHAVIOR AND WAITING MESSAGE
                    if (this.classicModeOn){
                        if (!rep.isYourTurn){
                            this.mpStopTimer()
                            this.animateWaitingMsg()
                        }
                        else{
                            this.mpResetTimer()
                            this.resetPlaceholder()
                            clearInterval(this.inGameWaitingMsg)
                        }
                    }
                    else{
                        this.resetPlaceholder()
                        clearInterval(this.inGameWaitingMsg)
                    }

                    // PER LETTER LOGIC
                    if (this.started){
                        if (rep.winner == true){
                            this.mpWordCardUpdate(rep.winningWord)
                            if (rep.winningWord) { this.mpWordListUpdate() }
                            this.mpWordMsg()
                            if (this.classicModeOn && !rep.isYourTurn){
                                this.cycleWordMessageClassic(rep.score)
                            }
                            this.$forceUpdate()
                            this.emphasizeInput(true)
                            this.emphasizeWordCard()
                            this.scoreKeeper()
                            this.mpNextLetter(rep.letter, rep.letterIndex)
                            this.mpRefreshTimer()
                            this.scrollWordCardList()
                        }
                        else if (!rep.winner){
                            this.finalWord = ''
                            this.mpWordCardUpdate(rep.winningWord)
                            if (rep.winningWord) { this.mpWordListUpdate() }
                            if (rep.score && rep.score !== 0 && this.classicModeOn && !rep.isYourTurn){
                                this.cycleWordMessageClassic(rep.score)
                            }
                            if (rep.score !== 0 && !this.classicModeOn){
                                this.mpWordMsg()
                            }
                            this.$forceUpdate()
                            this.emphasizeInput(false, rep.score)
                            this.emphasizeWordCard()
                            this.mpNextLetter(rep.letter, rep.letterIndex)
                            this.mpRefreshTimer()
                            this.scrollWordCardList()
                        }
                        else if (rep.winner == 'tie'){
                            if ((this.classicModeOn && !rep.isYourTurn) || (!this.classicModeOn && rep.score !== 0)){
                                this.mpWordMsg()
                            }
                            this.$forceUpdate()
                            this.emphasizeInput(false, rep.score)
                            this.mpNextLetter(rep.letter, rep.letterIndex)
                            this.mpRefreshTimer()
                        }
                    }

                    // END GAME LOGIC
                    if (rep.lost || rep.won || rep.tie || rep.opponentForfeit){
                        this.lost = true
                        this.mpBackToHome(rep.otherScore, rep.reason)
                        this.mpScoreFinal(rep.totalScore)
                        this.mpEndGame()

                        if (rep.lost){
                            this.mpLost = true
                        }
                        else if (rep.won){
                            this.mpLost = false
                        }
                        else if (rep.tie){
                            this.mpLost = false
                            this.mpTie = true
                        }
                        if (rep.opponentForfeit){
                            if (this.countingDown){
                                clearInterval(this.mpCountdownToGameStart)
                            }
                            this.mpLost = false
                        }
                    }

                })
                // CLOSE SOCKET
                this.webSocket.addEventListener("close", (event) => {
                    this.terminateWS()
                })
            }
            else{
                this.webSocket.send(JSON.stringify({
                    mode: this.mode,
                    order: this.order,
                    username: this.mpUsername
                }))
            }
        },
        determineMode(mode){
            if (this.mpClassicTut || (mode && mode == "Classic")){
                this.mode = "Classic"
                this.modeDescriptor = "Take turns playing big words!"
            }
            else if (this.mpSpeedTut || (mode && mode == "Speed")){
                this.mode = "Speed"
                this.modeDescriptor = "Race to play your big word first!"
            }
            else if (this.mpBattleTut || (mode && mode == "Battle")){
                this.mode = "Battle"
                this.modeDescriptor = "Play the biggest word!"
            }
        },
        mpEndGame() {
            this.resetWaiting()
            this.resetPlaceholder()
            this.stopTimerAndGame()
            if (!this.inParty || !this.isPartyLeader){this.webSocket.close()} 
        },
        softCloseWS(){
            if (this.webSocket){
                if (this.mpClassicTut){
                    this.mpClassicTut = true
                    this.mpSpeedTut = false
                    this.mpBattleTut = false
                }
                if (this.mpSpeedTut){
                    this.mpClassicTut = false
                    this.mpSpeedTut = true
                    this.mpBattleTut = false
                }
                if (this.mpBattleTut){
                    this.mpClassicTut = false
                    this.mpSpeedTut = false
                    this.mpBattleTut = true
                }

                this.terminateWS()
            }
        },
        terminateWS(){
            this.started = false
            this.resetWaiting()
            this.resetPlaceholder()
            clearInterval(this.mpCountdownToGameStart)
            this.countingDown = false
            this.countdown = 5
            if (this.inParty){
                this.leaveParty()
            }
            if (this.isPartyLeader){
                this.deleteParty()
            }
            if(this.webSocket){
                this.webSocket.close()
                this.webSocket = null
            }
        },

    },
    mounted: function initialize(){
        // GSAP & SCROLL
        gsap.registerPlugin(ScrollToPlugin)
        this.scrollToTop()
        $("#app")[0].style.display = "flex"

        // GRAB SCORES FROM LOCALSTORAGE
        if (!localStorage.lastScore || !localStorage.highScore){
            localStorage.setItem("lastScore", "0")
            localStorage.setItem("highScore", "0")
        }
        else{
            this.cookieScore = localStorage.lastScore ? localStorage.lastScore : 0
            this.cookieHighScore = localStorage.highScore || this.cookieHighScore !== '' ? localStorage.highScore : 0
        }

        // ADD EVENT LISTENERS
        window.addEventListener("beforeunload", (event) => {
            // REMOVE USERNAME IN SERVER
            if (this.hasUsername){
                if (this.webSocket){
                    this.webSocket.close()
                }
                navigator.sendBeacon("/", JSON.stringify({
                    username: this.mpUsername,
                    partyLeaderUsername: this.partyLeaderUsername ? this.partyLeaderUsername : null,
                    request: "leave"
                }))
            }

            // SET SCORE
            localStorage.setItem("lastScore", `${this.score}`)
            if (this.score > this.cookieHighScore){
                this.newHighScore = true
                localStorage.setItem("highScore", `${this.score}`)
            }

            return undefined
        })

        // main game form
        $("#form")[0].addEventListener("submit", this.callServerDictionary)
        this.$refs.input.addEventListener("keydown", (e)=>{
            this.$refs.input.style.outlineColor = this.wordCardOutlineColor
            if (e.keyCode === 32){e.preventDefault()}
            if ((e.metaKey || e.ctrlKey) && e.key == 'v'){e.preventDefault()}
        })
        this.$refs.input.addEventListener("contextmenu",(e)=>e.preventDefault())
        this.$refs.post.addEventListener("mousedown",(e)=>e.preventDefault())


        this.$refs.userInput.addEventListener("keydown", (e)=>{
            this.$refs.userInput.style.outlineColor = this.wordCardOutlineColor
            if (!e.key.match(/^[a-zA-Z0-9_]+$/)){e.preventDefault()}
            if (this.usernameError){
                $("#username-error")[0].remove(this.usernameError)
                this.usernameError = null
            }
        })
        this.$refs.userInput.addEventListener("paste", (e)=>{
            setTimeout(() => {
                this.$refs.userInput.value = this.$refs.userInput.value.replace(/[^a-zA-Z0-9]/g, '')
            }, 1)
        })
        
        // DARK MODE
        this.wordCardOutlineColor = window.matchMedia('(prefers-color-scheme: dark)').matches ? "#8875FF" : "#B79E01"
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
            this.wordCardOutlineColor = window.matchMedia('(prefers-color-scheme: dark)').matches ? "#8875FF" : "#fddc02"
        })
    },
    updated: function log(){
        // CHANGE WORD LIST DISPLAY FOR SCROLLING FIX
        if (this.$refs.wl.children.length >= 3){
            this.$refs.wl.style.justifyContent = "initial"
        }

        // START & END GAME DESIGN BEHAVIOUR
        if (this.started){
            this.shrinkHeader()
            if (this.t == 15 && !this.paused){
                setTimeout(() => {
                    this.$refs.input.focus()
                }, 250)
            }
        }
        else{
            this.expandHeader()
            this.cookieScore = localStorage.lastScore
            this.cookieHighScore = localStorage.highScore
        }

        // MULTIPLAYER USERNAME FORM
        if (this.joiningParty){
            $("#username-form")[0].addEventListener("submit", this.joinPartyByUsername)
        }
        else {
            $("#username-form")[0].addEventListener("submit", this.setUsername)
        }
    }
}).mount('#app')


