const { toRaw } = Vue

function $(elem){
    return document.querySelectorAll(elem)
}

wordsList = new Set()
mpWordCard = null
let wcoc = "#fddc02"
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
if (mediaQuery.matches) {
    wcoc = "#8875FF"
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
            tutorialOn: true,
            data: null,
            input: "",
            finalWord: '',
            t: 15,
            wordCard:{
                word: null,
                type: null,
                defs: null,
                syllablesOther: null,
                syllablesCustom: null,
            },
            foundClosest: false,
            closest: null, 
            alpha: "abcdefghijklmnopqrstuvwxyz".split(""),
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
            vWordsList: null,
            vWordsScrolled: [],
            vWordsOBJList: [],
            customScore:tpScore = null,
            input: null,       
            time: null,
            tries: 0,

            wordMsg: '',

            mode: "",
            order: "",
            classicModeOn: false,

            multiPlayer: false, 
            mpClassicTut: false,
            mpSpeedTut: false,
            mpWarTut: false,
            mpCTisHidden: true,
            mpSTisHidden: true,
            mpWTisHidden: true,

            webSocket: null,
            isWaiting: false,
            countingDown: false,
            countdown: 3,

            mpLost: null,
            mpTie: null,
            mpLostReason: null,
            mpFinalScore: null,
            autoSent: false,
            opponentScore: 0
        }
    },
    methods: {
        isInViewport() {
            const rect = this.$refs.input.getBoundingClientRect();
            if (
                rect.top >= -30 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            )
                {
                    this.pauseScroll = false

                    if (this.pausePress == true){
                    }
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
        setData(item){
            this.data = item
            this.wordCard.syllablesOther = item.tps
        },
        pause(){
            if (this.pausePress == false){
                this.pausePress = true

                if (this.paused == true){
                    this.$refs.input.disabled = true
                }
                else{
                    this.paused = true
                    this.$refs.input.disabled = true
                }
            }
            else {
                this.pausePress = false
                
                if (this.pauseScroll == true){
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
            if (this.isInViewport() == true && this.paused == false && this.started == true){            
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
            if (this.started == true){
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
        stopTimerAndGame(){
            clearInterval(this.time)
            this.t = 15
            this.started = false
        },
        resetStats(){
            this.paused = false
            this.lost = null
            this.currentLetter = ''
            this.finalWord = ''
            this.randomCounter = 0
            wordsList.clear()
            this.vWordsList = null
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
            this.$refs.input.style.outlineColor = wcoc
            clearInterval(this.time)
            this.time = null

            this.mpLost = null
            this.mpTie = null
            this.mpLostReason = null
            this.mpFinalScore = null
            this.autoSent = false
        },
        newGame() {
            this.tutorialOn = false
            this.started = true
            if (this.isRandomOrder == true){}
            else{this.alphaX = 0}
            this.currentLetter = this.alpha[this.alphaX]
            this.resetTimer()
        },
        mpClassicNewGame(){
            this.tutorialOn = false
            this.started = true
            if (this.isRandomOrder == true){}
            else{this.alphaX = 0}
            this.currentLetter = this.alpha[this.alphaX]
        },
        tutorialToggle(){
            if(this.tutorialOn == true){
                this.tutorialOn = false
            }
            else{
                this.tutorialOn = true
            }
        },
        async callServerDictionary(event){
            if (event){event.preventDefault()}
            if ((this.input == "" || this.input == null || this.input.replace(/[^A-Za-z]/g, '').length == 0) && this.t > 0){return}
            if ((event != undefined || event != null) && this.t <= 1){}
            else if ((this.input == "" || this.input == null) && this.t == 0){ 
                this.autoSent = false
                this.strike() 
                this.foundClosest = false
                this.wordCard.word = "Ran Out of Time"
            }
            else {
                if (this.t != 0){this.autoSent = false}
                else {this.autoSent = true}
                this.paused = true
                fetch("/", {
                    method: 'POST',
                    headers: {
                        "Content-Type": 'application/json'
                    },
                    body: JSON.stringify({
                        input: this.input.replace(/[^A-Za-z]/g, ''),
                    })
                })
                .then((response) => response.json())
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
                        this.$refs.input.style.textAlign = "center"
                        this.$refs.input.placeholder = "waiting..."
                    }
                })
                .catch(error => {
                    alert("Sorry, there was a problem communicating with our server.")
                })
            }
        },     
        enterWord(){
            this.tries++
            gsap.to(window, {
                scrollTo: {y: this.$refs.appWrap.offsetTop, autokill: true},
                duration: .5
            })
            try{
                if (this.input == ''){}
                else if (this.data.data[0] == undefined || toRaw(this.data.data[0].hwi) == undefined){
                    if (typeof toRaw(this.data.data[0]) != null){
                        this.foundClosest = true
                        this.closest = toRaw(this.data.data[0])
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
                            if (this.webSocket != null){
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
                                this.scroll()
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
            this.cycleWordMessage(0)
            if (this.webSocket != null){
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
                this.lost = true
                this.wordCard.word = null
                this.wordCard.type = null
                this.wordCard.defs = null
                this.stopTimerAndGame()
                localStorage.setItem("lastScore", `${this.score}`)
                if (this.score > this.cookieHighScore){
                    this.newHighScore = true
                    localStorage.setItem("highScore", `${this.score}`)
                }
                else{
                    this.newHighScore = false
                }
                if (this.webSocket!=null){
                    this.mpLost = true
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
            return this.input.split("")[0].toLowerCase() == this.alpha[this.alphaX].toLowerCase()
        },
        hasBeenUsed(){
            if (wordsList.has(this.input) || wordsList.has(this.input.charAt(0).toUpperCase() + this.input.slice(1))){
                for (let f = 0; f < this.$refs.wl.children.length; f++){
                    if (this.$refs.wl.children[f].innerHTML.includes(this.input) || this.$refs.wl.children[f].innerHTML.includes(this.input.charAt(0).toUpperCase() + this.input.slice(1))){
                        gsap.to(this.$refs.wl, {
                            scrollTo: {y: 0, x: (this.$refs.wl.children[f].offsetLeft - (this.$refs.wl.clientWidth / 2) + (this.$refs.wl.children[f].clientWidth / 2)), autokill: true},
                            duration: .5
                        })
                        this.$refs.wl.children[f].children[0].classList.toggle("btn-highlight")
                        setTimeout(() => {
                            this.$refs.wl.children[f].children[0].classList.toggle("btn-highlight2")
                        }, 2500);
                    }
                }
                return true
            }
            else return false
        },
        notLongEnough(){
            this.strike()
        }, 
        wordCardUpdate(input, data){
            for (let i = 0; i < data[0].meta.stems.length; i++){
                if (input == data[0].meta.stems[i].toLowerCase()){
                    this.wordCard.word = data[0].meta.stems[i]
                    this.wordCard.type = data[0].fl
                    this.wordCard.defs = data[0].shortdef
                }
            }
            if(this.wordCard.defs != null){
                this.vWordsOBJList.push(Object.values(toRaw(this.wordCard)))  
            }
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
        },
        syllableLengthCheck(){
            // FAIL
            if (toRaw(this.wordCard.syllablesCustom) < 3 && toRaw(this.wordCard.syllablesOther) < 3){
                this.cycleWordMessage(this.wordCard.syllablesOther)
                return this.wordPlayed = false
            }
            // SUCCESS
            // CUSTOM CHECK NULL CASE & THIRD PARTY SUCCEED
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
        wordListUpdate(){
            if (!this.multiPlayer){
                this.wordPlayed = true
                wordsList.add(toRaw(this.wordCard.word))
                this.vWordsList = wordsList  
            }
        },
        mpWordListUpdate(){
            this.wordPlayed = true
            wordsList.add(toRaw(this.wordCard.word))
            this.vWordsList = wordsList  
            if(this.wordCard.defs != null){
                this.vWordsOBJList.push(Object.values(toRaw(this.wordCard)))  
            }
        },
        cycleWordMessage(m){
            switch (m) {
                case 0:
                    this.wordMsg = 'oops!'
                    break;
                case 1:
                    this.wordMsg = 'not quite...'
                    break;
                case 2:
                    this.wordMsg = 'hmm...'
                    break;
                case 3:
                    this.wordMsg = 'nice!'
                    break;
                case 4:
                    this.wordMsg = 'great!!'
                    break;
                case 5:
                    this.wordMsg = 'wonderful!!!'
                    break;
            }
            if (m >= 6) {
                this.wordMsg = 'incredible!!!!'
            }
            this.animateWordMsg()
        },
        mpWordMessage(mode){
            switch (mode) {
                case 'speed':
                    this.wordMsg = 'too slow!'
                    break;
                case 'war':
                    this.wordMsg = 'too small!'
                    break;
                case 'tie':
                    this.wordMsg = 'tie!'
                    break;
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
        scoreKeeper(){
            if (this.wordPlayed && this.tpScore){
                this.cycleWordMessage(this.wordCard.syllablesOther)
                this.score += this.wordCard.syllablesOther
                this.cookieScore = this.score
                localStorage.setItem("lastScore", `${this.score}`)
            }
            else if (this.wordPlayed && this.customScore){
                this.cycleWordMessage(this.wordCard.syllablesCustom)
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
            this.$refs.input.focus()
        },
        mpNextLetter(letter, index){
            this.alphaX = index
            if (letter == null || letter == undefined){
                this.currentLetter = this.alpha[index]
            }
            else {this.currentLetter = letter}
            this.tpScore, this.customScore = false
            this.wordPlayed = false
            this.$refs.input.focus()
        },
        scroll(){
            setTimeout(() => {
                if (this.$refs.wl.children[this.$refs.wl.children.length-1] == undefined){}
                else {
                    this.vWordsScrolled.push(this.$refs.wl.children[this.$refs.wl.children.length-1].scrollWidth)
                    gsap.to(this.$refs.wl, {
                        scrollTo: {y: 0, x: this.$refs.wl.scrollWidth, autokill: true},
                        duration: .5
                    })
                }
            }, 100);
            gsap.fromTo(".def-pop", {
                opacity: 0
            }, {
                opacity: 1,
                duration: 1
            })
            gsap.to(".def-pop", {
                opacity: 0,
                delay: 3
            })
        },
        replaceWordCard(event){
            this.finalWord = ''
            for (let e = 0; e < this.vWordsOBJList.length; e++){
                if (event.target.innerHTML == this.vWordsOBJList[e][0]){
                    this.wordCard.word = this.vWordsOBJList[e][0]
                    this.wordCard.type = this.vWordsOBJList[e][1]
                    this.wordCard.defs = this.vWordsOBJList[e][2]
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
        randomOrder(event, boolean){
            if (boolean == false){{
                this.isRandomOrder = false
                this.alphaX = 0
                this.currentLetter = this.alpha[this.alphaX]
            }}
            else{
                this.isRandomOrder = true
                if (!this.multiPlayer){
                    this.alphaX = Math.floor(Math.random() * 26)
                    this.currentLetter = this.alpha[this.alphaX]
                }
            }
        },
        twoPlayer(){
            if(this.multiPlayer == true){this.multiPlayer = false}
            else {this.multiPlayer = true}
        },
        mpCTHide(){
            if (this.mpCTisHidden == false){this.mpCTisHidden = true}
            else{this.mpCTisHidden = false}
        },
        mpSTHide(){
            if (this.mpSTisHidden == false){this.mpSTisHidden = true}
            else{this.mpSTisHidden = false}
        },
        mpWTHide(){
            if (this.mpWTisHidden == false){this.mpWTisHidden = true}
            else{this.mpWTisHidden = false}
        },
        classicTutToggle(){
            if (this.mpClassicTut == false){this.mpClassicTut = true}
            else{this.mpClassicTut = false}
        },
        speedTutToggle(){
            if (this.mpSpeedTut == false){this.mpSpeedTut = true}
            else{this.mpSpeedTut = false}
        },
        warTutToggle(){
            if (this.mpWarTut == false){this.mpWarTut = true}
            else{this.mpWarTut = false}
        },
        backToMulti(){
            this.mpClassicTut = false
            this.classicModeOn = false
            this.mpSpeedTut = false
            this.mpWarTut = false
            this.multiPlayer = true
            this.lost = false
        },
        backToSolo(){
            this.mpClassicTut = false
            this.classicModeOn = false
            this.mpSpeedTut = false
            this.mpWarTut = false
            this.multiPlayer = false
            this.lost = false
        },
        quit(){
            this.started = false
            this.tutorialOn = false
            this.backToSolo()

            restart = gsap.timeline()
            .to(".logo", {
                height: "80px",
                duration: .5
            })
            .to(".logo-holster", {
                height: "90px",
                margin: "0 0 2rem",
                duration: .5
            }, "<")

            if (this.score > this.cookieHighScore){
                this.newHighScore = true
                this.cookieScore = this.score
                localStorage.setItem("highScore", `${this.score}`)
            }
            this.cookieScore = localStorage.getItem("lastScore")
            if (this.cookieScore == null){this.cookieScore = 0}
            this.cookieHighScore = localStorage.getItem("highScore")
            if (this.cookieHighScore == null || this.cookieHighScore == ""){this.cookieHighScore = 0}

            this.resetStats()
        },
        startWebSocket(){
            if (this.mpClassicTut){
                this.mode = "classic"
            }
            else if (this.mpSpeedTut){
                this.mode = "speed"
            }
            else if (this.mpWarTut){
                this.mode = "war"
            }
            if(this.isRandomOrder){
                this.order = "random"
            }
            else {this.order = "default"}
            this.webSocket = new WebSocket(`wss://${window.location.hostname}:${window.location.port}`)
            this.webSocket.addEventListener("open", (event) => {
                this.webSocket.send(JSON.stringify({
                    mode: this.mode,
                    order: this.order
                }))
            })
            this.webSocket.addEventListener("message", (event) => {
                rep = JSON.parse(event.data)
                if (rep.waiting == true){
                    this.isWaiting = true
                }
                else if (rep.waiting == false && rep.inGame == true){
                    if (rep.isClassic == true){
                        this.classicModeOn = true
                    }
                    this.countingDown = true
                    mpCountdown = setInterval(() => {
                        this.countdown--
                        if (this.countdown == 0){
                            clearInterval(mpCountdown)
                            this.countdown = 3
                            this.countingDown = false

                            if (this.classicModeOn){
                                this.resetStats()
                                this.mpClassicNewGame()
                                if (rep.isYourTurn == true){
                                    this.mpResetTimer()
                                }
                            }
                            else {
                                this.resetStats()
                                this.newGame()
                            }
                            this.mpNextLetter(rep.letter, rep.letterIndex)
                        }
                    }, 1000);
                }
                if (rep.opponentForfeit == true){
                    this.stopTimerAndGame()
                    this.lost = true
                    this.mpLost = false
                    this.mpLostReason = "Opponent quit or disconnected"
                    this.mpScoreFinal(this.score)
                }
                // DOM UPDATE & SCORE LOGIC
                if (this.wordCard != null || this.wordCard != undefined){
                    this.$refs.input.style.textAlign = "left"
                    this.$refs.input.placeholder = ""
                    if (rep.winner == true){
                        mpWordCard = rep.winningWord
                        toRaw(this.wordCard).word = rep.winningWord.word
                        toRaw(this.wordCard).type = rep.winningWord.type
                        toRaw(this.wordCard).defs = rep.winningWord.defs
                        toRaw(this.wordCard).syllablesOther = rep.winningWord.syllablesOther
                        toRaw(this.wordCard).syllablesCustom = rep.winningWord.syllablesCustom
                        if (this.$refs.wl.children[0] == undefined){
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
                            wordsList.add(toRaw(this.wordCard.word))
                            this.vWordsList = wordsList  
                        }
                        this.mpWordListUpdate()
                        this.$forceUpdate();
                        this.$refs.input.style.outlineColor = "green"
                        gsap.to(this.$refs.wordCardDisplay, {
                            outline: `0px solid ${wcoc}`,
                            duration: .5
                        })
                        this.scoreKeeper()
                        this.mpNextLetter(rep.letter, rep.letterIndex)
                        this.scroll()
                        if (this.classicModeOn){}
                        else {
                            this.mpStopTimer()
                            this.mpResetTimer()
                        }
                    }
                    else if (rep.winner == false){
                        mpWordCard = rep.winningWord
                        toRaw(this.wordCard).word = rep.winningWord.word
                        toRaw(this.wordCard).type = rep.winningWord.type
                        toRaw(this.wordCard).defs = rep.winningWord.defs
                        toRaw(this.wordCard).syllablesOther = rep.winningWord.syllablesOther
                        toRaw(this.wordCard).syllablesCustom = rep.winningWord.syllablesCustom
                        if (this.$refs.wl.children[0] == undefined){
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
                            wordsList.add(toRaw(this.wordCard.word))
                            this.vWordsList = wordsList  
                        }
                        this.mpWordListUpdate()
                        this.$forceUpdate()
                        if (rep.score == 0){
                            this.$refs.input.style.outlineColor = "red"
                        }
                        else {
                            this.$refs.input.style.outlineColor = wcoc
                        }
                        wcOutline = gsap.timeline()
                        .to(this.$refs.wordCardDisplay, {
                            outline: `9px solid ${wcoc}`,
                            duration: .5
                        })
                        .to(this.$refs.wordCardDisplay, {
                            outline: `0px solid ${wcoc}`,
                            duration: .5
                        }, "<+=2")
                        if (rep.score == 0 || this.classicModeOn){}
                        else {
                            if (this.wordPlayed == false){}
                            else {this.mpWordMessage(this.mode)}
                        }
                        this.mpNextLetter(rep.letter, rep.letterIndex)
                        try {
                            this.scroll()  
                        } catch (e) {}
                        if (this.classicModeOn){}
                        else {
                            this.mpStopTimer()
                            this.mpResetTimer()
                        }
                    }
                    else if (rep.winner == "tie"){
                        this.$forceUpdate()
                        if (rep.score == 0){
                            this.$refs.input.style.outlineColor = "red"
                        }
                        else {
                            this.$refs.input.style.outlineColor = wcoc
                        }
                        if (rep.score == 0 || this.classicModeOn){}
                        else {
                            if (this.wordPlayed == false){}
                            else {this.mpWordMessage('tie')}
                        }
                        this.mpNextLetter(rep.letter, rep.letterIndex)
                        if (this.classicModeOn){}
                        else {
                            this.mpStopTimer()
                            this.mpResetTimer()
                        }
                    }
                    if (this.classicModeOn == true){
                        if (rep.isYourTurn == false){
                            this.mpStopTimer()
                            this.$refs.input.style.textAlign = "center"
                            this.$refs.input.placeholder = "waiting..."
                        }
                        if (rep.isYourTurn == true){
                            this.mpResetTimer()
                            this.$refs.input.style.textAlign = "left"
                            this.$refs.input.placeholder = ""
                        }
                    }
                }
                // END GAME LOGIC
                if (rep.lost == true){
                    this.mpLost = true
                    this.mpLostReason = rep.reason
                    this.lost = true
                    this.isWaiting = false
                    this.mpScoreFinal(rep.totalScore)
                    this.opponentScore = rep.otherScore
                    this.stopTimerAndGame()
                    this.webSocket.close()
                    this.mpClassicTut, this.mpSpeedTut, this.mpWarTut = false
                    this.classicModeOn = false
                    this.mode = ""
                }
                else if (rep.won == true){
                    this.mpLost = false
                    this.mpLostReason = rep.reason
                    this.lost = true
                    this.isWaiting = false
                    this.mpScoreFinal(rep.totalScore)
                    this.opponentScore = rep.otherScore
                    this.stopTimerAndGame()
                    this.webSocket.close()
                    this.mpClassicTut, this.mpSpeedTut, this.mpWarTut = false
                    this.classicModeOn = false
                    this.mode = ""
                }
                else if (rep.tie == true){
                    this.mpLost = false
                    this.mpTie = true
                    this.mpLostReason = rep.reason
                    this.lost = true
                    this.isWaiting = false
                    this.mpScoreFinal(rep.totalScore)
                    this.opponentScore = rep.otherScore
                    this.stopTimerAndGame()
                    this.webSocket.close()
                    this.mpClassicTut, this.mpSpeedTut, this.mpWarTut = false
                    this.classicModeOn = false
                    this.mode = ""
                }
            })
            this.webSocket.addEventListener("close", (event) => {
                this.isWaiting = false
                this.webSocket = null
            })
        },
        closeWebSocket(){
            if (this.webSocket != null || this.webSocket != undefined){
                this.webSocket.close()
                this.isWaiting = false
                this.webSocket = null
                this.started = false
                this.backToMulti()
                this.resetStats()
                restart = gsap.timeline()
                .to(".logo", {
                    height: "80px",
                    duration: .5
                })
                .to(".logo-holster", {
                    height: "90px",
                    margin: "0 0 2rem",
                    duration: .5
                }, "<")
                if (this.score > this.cookieHighScore){
                    this.newHighScore = true
                    this.cookieScore = this.score
                    localStorage.setItem("highScore", `${this.score}`)
                }
                this.cookieScore = localStorage.getItem("lastScore")
                this.cookieHighScore = localStorage.getItem("highScore")
            }
            else {}
        }
    },
    beforeCreate() {},
    beforeMount() {},
    mounted: function initialize(){
        $("#form")[0].addEventListener("submit", this.callServerDictionary)
        window.addEventListener("beforeunload", (event) => {
            if (this.webSocket == null){}
            else this.webSocket.close()
            localStorage.setItem("lastScore", `${this.score}`)
            if (this.score > this.cookieHighScore){
                this.newHighScore = true
                localStorage.setItem("highScore", `${this.score}`)
            }
        });
        if (localStorage.getItem("lastScore") == null || localStorage.getItem("highScore") == null){
            localStorage.setItem("lastScore", "0")
            localStorage.setItem("highScore", "0")
        }
        else{
            this.cookieScore = localStorage.getItem("lastScore")
            this.cookieHighScore = localStorage.getItem("highScore")
            if (this.cookieHighScore == null || this.cookieHighScore == ""){this.cookieHighScore = 0}
        }
        // GSAP
        document.addEventListener("DOMContentLoaded", ()=>{
            gsap.registerPlugin(ScrollToPlugin)
            introTL = gsap.timeline()
            .to(".logo", {
                height: "80px",
                width: "120px",
                duration: .75,
                delay: .35,
                margin: 0,
                ease: "power3.inOut"
            })
            .to(".logo-holster", {
                height: `90px`,
                duration: 1,
                ease: "power4.inOut"
    
            }, "<+=0.0125")
            .to("#app", {
                height: "auto",
                duration: .15,
                opacity: 1,
                ease: "power4.inOut"
    
            }, "<")
            .set("#app", {
                display: "flex"
            })
            .fromTo(".card", {
                opacity: 0
            }, {
                opacity: 1,
                duration: .5,
                ease: "power4.out"
            }, "<+=.1")
            .call(function(){
                $("body")[0].classList.add("overflow")

            })
        })
        this.$refs.input.addEventListener("keydown", ()=>{
            this.$refs.input.style.outlineColor = wcoc
        })
        this.$refs.input.addEventListener("keydown", (e)=>{
            if (e.keyCode === 32){e.preventDefault();}
        })
        this.$refs.input.addEventListener("paste", (e)=>{
            e.preventDefault()
            return false
        })
    },
    updated: function log(){
        if (this.$refs.wl.children.length > 3){
            this.$refs.wl.style.justifyContent = "initial"
        }
        if (this.started){
            $("html")[0].style.height = "auto"
            $("html")[0].style.overflow = "scroll"
            gsap.to([".logo", ".logo-holster"], {
                height: 0,
                margin: 0,
                duration: .5
            })
            if (this.t == 15){
                setTimeout(() => {
                    this.$refs.input.focus()
                }, 500);
            }
        }
        else{
            if (this.lost == true){
                restart = gsap.timeline()
                .to(".logo", {
                    height: "80px",
                    duration: .5
                })
                .to(".logo-holster", {
                    height: "90px",
                    margin: "0 0 2rem",
                    duration: .5
                }, "<")
                this.cookieScore = localStorage.getItem("lastScore")
                this.cookieHighScore = localStorage.getItem("highScore")
            }
            $("html")[0].style.height = "100%"
        }
    }
}).mount('#app')


