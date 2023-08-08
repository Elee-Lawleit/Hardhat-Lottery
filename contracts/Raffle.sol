// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";

//this is for the time interval thing
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";


//Enter lottery by paying some amount
//pick random winner through VRF
//winner to be selected after a certain time period -> completely automated

//will need chailink oracles to do two things

// 1. give random number (through VRF)
// 2. selection automation (through Chainlink Keepers)

error Raffle__NotEnoughETHEntered();
error Raffle__TransferFailed();
error Raffle__NotOpen();
error Raffle__UpkeepNotNeeded(uint256 currentBalance, uint numPlayers, uint256 raffleState);

contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    /* Types  */

    enum RaffleState{
        OPEN,
        CALCULATING
    }

    /* state variables */
    //immutable variable
    uint256 private immutable i_entranceFee;
    address payable[] private s_players;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator; //this avariable is gonna hold the contract
    // the other variable in the constructor ONLY holds the ADDRESS
    // this one holds the REFERENCE to the contract object, if that makes sense
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private immutable i_callbackGasLimit;
    uint32 private constant NUM_WORDS = 1;

    // Lottery variables
    address private s_recentWinner;
    RaffleState private s_raffleState;
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval;

    /* Events */
    event RaffleEnter(address indexed player);
    event RequestedRaffleWinner(uint256 indexed requestId);
    event WinnerPicked(address indexed winner);

    //calling the constructor of Super contract here
    //and passing it the address of the coordinator contract's address (coordinator does the random number verrification)
    constructor(
        address vrfCoordinatorV2, //address, so we probably need to deploy this one first (mocks)
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    function enterRaffle() public payable {
        if (msg.value < i_entranceFee) {
            revert Raffle__NotEnoughETHEntered();
        }
        if(s_raffleState != RaffleState.OPEN){
            revert Raffle__NotOpen();
        }
        s_players.push(payable(msg.sender));

        //Emit an event when a new player joins the lottery
        //an event can have upto three indexed parameters
        //unindexed params are encoded into the ABI
        emit RaffleEnter(msg.sender);
    }

    /**
     * @dev This is the function that the chainlink keeper nodes call
     * They look for this function to see if "something" has happened yet (checks after a certain time interval)*
     * if it returns true, that means "Yes"*
     * Should return true only if:
     * 1. Our time interval has passed
     * 2. The lottery has at least one player
     * 3. Our subscription is funded with LINK
     * 4. The loterry is in open state
     */

    //performData is a variable which we can use to do something else when the interval hits
    function checkUpkeep(bytes memory /*checkData*/) public override returns (bool upkeepNeeded, bytes memory /* performData */){
        bool isOpen = (RaffleState.OPEN == s_raffleState);
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);

        bool hasPlayers = (s_players.length > 0);
        bool hasBalance = address(this).balance > 0;

        //named the return, so it will automatically return, don't need an explicit return statement here
        upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
    }

    // we will change this to be performUpKeep. ie to perform stuff we want to perform after the interval
    //performData will automatically be passed here
    function performUpkeep(bytes calldata /* performData */) external override {
        (bool upkeedNeeded, ) = checkUpkeep("");
        if(!upkeedNeeded){
            revert Raffle__UpkeepNotNeeded(address(this).balance, s_players.length, uint256(s_raffleState));
        }
        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane, //specifying the max amount of gas we want to use
            i_subscriptionId, //the id of the contract that has the subscription
            REQUEST_CONFIRMATIONS, //how many blocks you want to wait
            i_callbackGasLimit, //how much gas fulfillRandomWords can use
            NUM_WORDS //how many random numbers we want
        );

        emit RequestedRaffleWinner(requestId);
    }

    //overriden from the VRFConsumerBaseV2 contract
    //we know that requestId is also returned, but we don't need it, so we're just gonna say that yea, I know there should be a parameter of type uint256, but we Don't care
    function fulfillRandomWords(
        uint256, /*requestId*/
        uint256[] memory randomWords
    ) internal override {
        //the random words we're gonna receive is gonna be inside an array, because there can be more than 1 numbers requested. For one number requested, it will just be an array of length 1

        //our players array can be of any size, like 50 for example, but VRF doesn't care about the 50 range, it can return something like 23423423432432. so, to deal with that, we perform a modulus operation, numberReturned % length of array or range basically. So then, we will have the random number returned to us according to our range
        uint256  indexOfWinner = randomWords[0] % s_players.length;

        //the winner's address
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;
        //opening the loterry for people to enter again
        s_raffleState = RaffleState.OPEN;
        //updating the players array to zero
        s_players = new address payable[](0);
        s_lastTimeStamp = block.timestamp;
        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        if(!success){
            revert Raffle__TransferFailed();
        }
        emit WinnerPicked(recentWinner);
    }

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns(address){
        return s_recentWinner;
    }

    function getRaffleState() public view returns(RaffleState) {
        return s_raffleState;
    }

    //because it's NOT reading the storage
    //NUM_WORDS is a constant, so it's literally stored in the bytecode
    function getNumWords() public pure returns(uint256){
        return NUM_WORDS;
    }

    function getNumberOfPlayers() public view returns (uint256){
        return s_players.length;
    }

    function getLatestTimeStamp() public view returns (uint256){
        return s_lastTimeStamp;
    }

    function getRequestConfirmations() public pure returns (uint256){
        return REQUEST_CONFIRMATIONS;
    }
}
