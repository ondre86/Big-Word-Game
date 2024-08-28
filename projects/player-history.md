# Player History

Player History is the [linked list](#https://www.youtube.com/watch?v=njTh_OwMljA) of the statistics representing previous games played by the player.


# Player History Functions

SetPlayerHistoryPageSize(playerid int, pagesize int)
GetFirstPlayerHistory(playerid int) PlayerHistory
GetLastPlayerHistory() PlayerHistory
GetPageOfPlayerHistory(pagesize int) (hasNext bool)

## Features of Player History

ID
GameMode
GameStats
RankedPlayers
PrevId - id of most recent player history
NextId - id of subsequent player history


