const express = require('express')
const helmet = require('helmet')
const syl = require('syllabificate')
const server = express()
const port = 8383
const key = "f985ea64-0887-4672-bb91-9f61fd82fb75"
let data

server.use(express.static('public')).use(express.json())
server.use(helmet())
server.disable('x-powered-by')

server.post('/', async (req, res)=>{
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

server.use((req, res, next) => {
    res.status(404).sendFile('404.html', {root: 'public'})
})
  
server.use((err, req, res, next) => {
    console.error(err.stack)
    res.status(500).send('Something broke!')
})

server.listen(port, () => {
    console.log("server started")
})

async function dictionaryCall(input){
    try{
        let dictURL = `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${input}?key=${key}`
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

