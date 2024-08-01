const { toRaw } = Vue
const serverURL = '/'
function $(elem){
    return document.querySelectorAll(elem)
}
wordsList = new Set()

const app = Vue.createApp({
    data() {
        return {
            started: null,
            startBtn: null,
            tutBtn: null,
            lost: null,
            tutorialOn: true,
            data: null,
            input: "",
            finalWord: '',
            t: 0,
            wordCard:{
                word: null,
                type: null,
                defs: null,
                syllablesOther: null,
                syllablesCustom: null,
                sortOrder: null,
            },
            foundClosest: false,
            closest: null, 
            alpha: "abcdefghijklmnopqrstuvwxyz".split(""),
            alphaX: 0,
            currentLetter: 'a',
            rounds: 1,
            score: 0,
            cookieScore: 0,
            cookieHighScore: 0,
            newHighScore: null,
            strikes: 0,
            wordPlayed: false,
            vWordsList: null,
            vWordsScrolled: [],
            customScore:tpScore = null,
            input: null,       
            time: null   
        }
    },
    methods: {
        setData(item){
            this.data = item
            this.wordCard.syllablesOther = item.tps
        },
        timer(){
            this.t++
            
            if (this.t < 10){
                this.$refs.post.disabled = false
                this.$refs.input.disabled = false
            }
            if (this.t == 10){
                this.$refs.post.disabled = true
                this.$refs.input.disabled = true
            }
            if (this.t == 11 && this.strikes != 3){
                this.$refs.post.disabled = false
                this.$refs.input.disabled = false
                this.t = 0
                this.callServerDictionary()
            }
            else if(this.t == 11 && this.strikes == 3){
                this.stopTimerAndGame()
            }
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
            this.t = 0
            if (this.started == true){
                this.$refs.post.disabled = false
                this.$refs.input.disabled = false
                this.$refs.input.focus()
            }
            else {}
            this.$refs.input.focus()
        },
        stopTimerAndGame(){
            clearInterval(this.time)
            this.t = 0
            this.started = false
        },
        resetStats(){
            this.lost = null
            this.alphaX = 0
            this.currentLetter = 'a'
            wordsList.clear()
            this.vWordsList = null
            this.vWordsScrolled = []
            this.score = 0
            this.newHighScore = false
            this.strikes = 0
            this.wordPlayed = false
            this.customScore, this.tpScore = null
            this.wordCard.word = null
            this.wordCard.type = null
            this.wordCard.def = null
            this.wordCard.syllablesOther = null
            this.wordCard.syllablesCustom = null
            this.wordCard.sortOrder = null
            this.foundClosest = false,
            this.closest = null
            this.$refs.input.style.outlineColor = "#8875FF"

        },
        newGame() {
            this.started = true
            this.time = setInterval(this.timer, 1000);
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
            if (this.input == "" || this.input == null){ 
                this.strike() 
                this.foundClosest = false
                this.wordCard.word = "Empty"
            }
            else {
                fetch(serverURL, {
                    method: 'POST',
                    headers: {
                        "Content-Type": 'application/json'
                    },
                    body: JSON.stringify({
                        input: this.input.replace(/[^A-Za-z]/g, '')
                    })
                })
                .then((response) => response.json())
                .then((success) => {
                    this.input = this.input.replace(/[^A-Za-z]/g, '').toLowerCase()
                    this.setData(success)
                    this.enterWord()
                    this.input = ''
                    }
                )

                .catch(error => alert("Too many attempts. Please wait a few seconds."))
            }
        },
        
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
                else{
                    if (!this.isCurrentLetter()){
                        this.strike()
                        this.foundClosest = false
                        this.wordCard.word = "Wrong Letter"
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
                this.wordCard.word = "Really Not a Word"
            }
        },

        strike(){
            this.strikes++
            this.$refs.input.style.outlineColor = "red"
            if (this.strikes == 3){
                this.finalWord = this.$refs.input.value
                this.lost = true
                this.wordCard.word = null
                this.wordCard.type = null
                this.wordCard.defs = null
                this.stopTimerAndGame()
                document.cookie = `score=${this.score}; max-age=${60*60*24*365}; sameSite=lax` 

                if (this.score > this.cookieHighScore){
                    newHighScore = true
                    this.cookieHighScore = this.score
                    document.cookie = `highScore=${this.cookieHighScore}; max-age=${60*60*24*365}; sameSite=lax` 
                }
                else{
                    newHighScore = false
                }
            }
            else{
                this.resetTimer()
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
            return this.input.split("")[0].toLowerCase() === this.alpha[this.alphaX]
        },
        hasBeenUsed(){
            if (wordsList.has(this.input)){
                for (let f = this.$refs.wl.children.length-1; f > -1; f--){
                    if (this.$refs.wl.children[f].innerHTML == this.input){
                        this.$refs.wl.scrollTo(this.$refs.wl.children[f].offsetLeft - this.$refs.wl.children[f].clientWidth, 0)
                        this.$refs.wl.children[f].style.outline = "4.5px solid #8875FF"
                        setTimeout(() => {
                            this.$refs.wl.children[f].style.outline = "0px solid black" 
                        }, 2000);
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
                    this.wordCard.sortOrder = data[0].meta.sort
                }
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
        },       
        wordListUpdate(){
            this.wordPlayed = true
            wordsList.add(toRaw(this.wordCard.word))
            this.vWordsList = wordsList  
        },
        scoreKeeper(){

            if (this.wordPlayed && this.tpScore){
                this.score += this.wordCard.syllablesOther
            }
            else if (this.wordPlayed && this.customScore){
                this.score += this.wordCard.syllablesCustom
            }
            if (this.score > this.cookieHighScore){
                this.newHighScore = true
                this.cookieHighScore = this.score
                document.cookie = `highScore=${this.cookieHighScore}; max-age=${60*60*24*365}; sameSite=lax` 
            }

        },
        nextLetter() {
            if (this.alphaX == 25){
                this.alphaX = 0
                this.currentLetter = this.alpha[this.alphaX]
                this.rounds++
            }
            else{
                this.alphaX++
                this.currentLetter = this.alpha[this.alphaX]
            }
            this.tpScore, this.customScore = false
            this.$refs.input.focus()
        },
        scroll(){
            setTimeout(() => {
                this.vWordsScrolled.push(this.$refs.wl.children[this.$refs.wl.children.length-1].scrollWidth)
                gsap.to(this.$refs.wl, {
                    scrollTo: {y: 0, x: this.$refs.wl.scrollWidth},
                    duration: 2
                })
            }, 100);
        }
    },
    beforeCreate() {

    },
    beforeMount() {

    },
    mounted: function initialize(){
        // COOKIES
        if (document.cookie == ""){
            document.cookie = `seenInstructions=true; max-age=${60*60*24*365}; sameSite=lax`; 
            document.cookie = `score=0; max-age=${60*60*24*365}; sameSite=lax`; 
            document.cookie = `highScore=0; max-age=${60*60*24*365}; sameSite=lax`; 
        }
        else{
            this.cookieScore = document.cookie
            .split("; ")
            .find((row) => row.startsWith("score="))
            ?.split("=")[1];

            this.cookieHighScore = document.cookie
            .split("; ")
            .find((row) => row.startsWith("highScore="))
            ?.split("=")[1];

            this.tutorialToggle()
        }

        // GSAP
        document.addEventListener("DOMContentLoaded", ()=>{
            gsap.registerPlugin(Flip,TextPlugin,CustomEase,ScrollToPlugin)
            introTL = gsap.timeline()
            .to(".logo", {
                height: "100px",
                width: "160px",
                duration: 1,
                delay: .5,
                margin: 0,
                ease: "power4.inOut"
            })
            .to(".logo-holster", {
                height: `110px`,
                duration: 1,
                ease: "power4.inOut"
    
            }, "<")
            .to("#app", {
                height: "auto",
                duration: .25,
                opacity: 1,
                ease: "power4.inOut"
    
            }, "<")
            .set("#app", {
                display: "flex"
            })
            .fromTo([this.$refs.startBtn, ".credit"], {
                opacity: 0,
                y: "0%"
            }, {
                opacity: 1,
                duration: .3
            }, "<+=.2")
            .fromTo(".tut-card", {
                opacity: 0
            }, {
                opacity: 1,
                duration: 1
            }, "<")
            .call(function(){
                $("body")[0].classList.add("overflow")

            })

            if (this.tutorialOn == true){
                setTimeout(() => {
                    this.$refs.tutBtn1.focus()
                }, 4000)
            }
            else if (this.lost == true || this.started == null){
                setTimeout(() => {
                    this.$refs.startBtn.focus()
                }, 2500)
            }
        })

        // RESET FOCUS COLOR
        this.$refs.input.addEventListener("keydown", ()=>{
            this.$refs.input.style.outlineColor = "#8875FF"
        })
    },
    updated: function log(){
        if (this.tutorialOn == true){
            setTimeout(() => {
                this.$refs.tutBtn1.focus()
            },4000);
        }
        else if (this.lost == true || this.started == null){
            this.$refs.startBtn.focus()
        }
        else if (this.t == 0 && this.started == true){
            this.$refs.input.focus()
        }

        if (this.$refs.wl.children.length > 3){
            this.$refs.wl.style.justifyContent = "initial"
        }

        if (this.started){
            $("html")[0].style.height = "auto"
            $("html")[0].style.overflow = "scroll"
        }
        else{
            $("html")[0].style.height = "100%"
        }
    }

}).mount('#app')


