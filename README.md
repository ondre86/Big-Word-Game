# [The Big Word Game](https://thebigwordgame.com)
## An _upbeat_ game designed to test and sharpen players' vocabulary skills
The Big Word Game is a single page web application that users can connect to and play over the internet.

It's based on a game that my mother, _an English teacher with over 20 years of experience_, would play with my siblings and I on long road trips. 

Players have 15 seconds to enter a word that starts with the target letter shown on their screen **and** that word must contain **three** or more syllables.
There are a few other minor rules that keep the game clean and competitive, as well.

After a successful word is played, the the word is added to your "used" list, and its definition is shown on screen.

Players can play until they get 3 strikes, or the round ends.

## Use Cases
#### Learning New Words 
- Teachers playing on their big classroom screen, oscillating between student participation and the teachers introducing new words to the children
- Parents playing alongside their children at home, either as a leisure or homeschooling activity, doing the same as above
#### Having Fun
- Children playing together in school, with solo games during quiet time and multiplayer games during fun time
- Teens and adults playing against each other online for easy, low-stakes competition, and a change of pace from social media apps
#### Staying Fresh
- Adults and seniors playing often as a way to keep their brains active and their vocabularies sharp

## Tech Stack
- HTML
- [Sass](https://sass-lang.com/) (CSS)
- JavaScript
  - [Vue.JS](https://vuejs.org/) (Client-side framework)
  - [Node.JS](https://nodejs.org/en) (Server-side runtime)
  - [Express](https://expressjs.com/) (Server-side framework)
  - [express-ws](https://www.npmjs.com/package/express-ws) (Express Websocket Middleware)
  - [helmet](https://www.npmjs.com/package/helmet) (Express Security Middleware)
  - [Syllabificate](https://github.com/EndaHallahan/syllabificate) (JS library for counting syllables)
  - [Merriam-Webster Dictionary API](https://dictionaryapi.com/) (API for word validation)
 - [GitHub](https://github.com) (Version Control & Repository)
 - [Railway](https://railway.app) (Deployments from GitHub)
 - [Umami](https://umami.is) (Website Analytics)

- - -
© 2024 Ondre Johnson. All Rights Reserved.
