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

      describe("constructor", async function () {
        it("Initializes the raffle correctly", async function () {
          const raffleState = await raffle.getRaffleState();
          //enum value 0 for open, 1 for closed/calculating
          // stringifying big number returned by blockchain
          assert.equal(raffleState.toString(), "0");
          assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
        });
      });

      describe("enterRaffle", async function () {
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
    });
