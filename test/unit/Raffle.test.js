//tests written using Waffle

const { network, ethers, getNamedAccounts, deployments } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat-config");
const { assert, expect } = require("chai");

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle", async function () {
      let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval;
      const chainId = network.config.chainId;

      beforeEach(async function () {
        //take deployer property from whatever was returned
        deployer = (await getNamedAccounts()).deployer;

        //deploy all the contracts
        await deployments.fixture(["all"]);
        raffle = await ethers.getContract("Raffle", deployer);
        vrfCoordinatorV2Mock = await ethers.getContract(
          "VRFCoordinatorV2Mock",
          deployer
        );
        raffleEntranceFee = await raffle.getEntranceFee();
        interval = await raffle.getInterval();
      });

      describe("constructor", function () {
        it("Initializes the raffle correctly", async function () {
          const raffleState = await raffle.getRaffleState();
          //enum value 0 for open, 1 for closed/calculating
          // stringifying big number returned by blockchain
          assert.equal(raffleState.toString(), "0");
          assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
        });
      });

      describe("enterRaffle", function () {
        it("reverts when you don't pay enough", async function () {
          await expect(raffle.enterRaffle()).to.be.revertedWith(
            "Raffle__NotEnoughETHEntered"
          );
        });

        it("records players when they enter", async function(){
            await raffle.enterRaffle({value: raffleEntranceFee});
            const playerFromContract = await raffle.getPlayer(0);
            assert.equal(playerFromContract, deployer);
        })

        //to test for event emissions
        it("emits event on enter", async function(){
            await expect(raffle.enterRaffle({value: raffleEntranceFee})).to.emit(raffle, "RaffleEnter");
        })

        it("doesn't allow entrance when raffle is calculating/closed", async function(){
            await raffle.enterRaffle({value: raffleEntranceFee});

            //let's time travel to the future
            //increasing the blockchain time by 31 seconds
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
            //manually mining the block!
            //mines one block at a time
            await network.provider.send("evm_mine", []);

            //preteding to be the chainlink keeper nodes by calling performUpkeep manually
            await raffle.performUpkeep([]);

            //now the blockchain is in calculating state

            await expect(raffle.enterRaffle({value: raffleEntranceFee})).to.be.revertedWith("Raffle__NotOpen");
        })
      });
      describe("checkUpkeep", function(){
        it("returns false if people haven't sent any ETH", async function(){
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
          await network.provider.send("evm_mine", []);
          //since checkUpkeep is a public function, but not view, calling it gonna start a transaction, but don't want that, we only want to see what it's gonna return, if we were to call it
          //for this, we can use static calls, to see what it would return if called
          //note that we didn't enter the raffle in this "it", so no players mean, no eth sent
          const {upkeepNeeded} = await raffle.callStatic.checkUpkeep([]);
          assert(!upkeepNeeded);
        })

        it("returns false if raffle isn't open", async function(){
          await raffle.enterRaffle({value: raffleEntranceFee});
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
          await network.provider.send("evm_mine", []);
          await raffle.performUpkeep([]) //[] is same as "0x empty bytes object"
          const raffleState = await raffle.getRaffleState();
          //should return false when state is closed
          const {upkeepNeeded} = await raffle.callStatic.checkUpkeep([]);
          //should be closed
          assert.equal(raffleState.toString(), "1");
          assert.equal(upkeepNeeded, false);
        })
        it("returns false if enough time hasn't passed", async function(){
          await raffle.enterRaffle({value: raffleEntranceFee});
          //decreasing time now
          const scopedInterval = 1; //value in seconds btw
          //this doesn't work with time travelling back like [interval.toNumber - 1], for some reason
          //but can be tested by increasing less time than the specified interval, like increasing the time only 1 second
          await network.provider.send("evm_increaseTime", [Number(scopedInterval)]);
          //another way to do this
          await network.provider.request({method: "evm_mine", params: []});
          const {upkeepNeeded} = await raffle.callStatic.checkUpkeep("0x");
          assert(!upkeepNeeded);
        });
        it("returns true if enough time has passed, has players, ETH, and is open", async()=>{
          await raffle.enterRaffle({value: raffleEntranceFee});
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
          await network.provider.request({method: "evm_mine", params: []});
          const {upkeepNeeded} = await raffle.callStatic.checkUpkeep("0x");
          assert(upkeepNeeded);
        })
      })
    });
