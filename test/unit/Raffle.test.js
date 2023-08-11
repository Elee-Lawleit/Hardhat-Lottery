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

        it("records players when they enter", async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          const playerFromContract = await raffle.getPlayer(0);
          assert.equal(playerFromContract, deployer);
        });

        //to test for event emissions
        it("emits event on enter", async function () {
          await expect(
            raffle.enterRaffle({ value: raffleEntranceFee })
          ).to.emit(raffle, "RaffleEnter");
        });

        it("doesn't allow entrance when raffle is calculating/closed", async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee });

          //let's time travel to the future
          //increasing the blockchain time by 31 seconds
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          //manually mining the block!
          //mines one block at a time
          await network.provider.send("evm_mine", []);

          //preteding to be the chainlink keeper nodes by calling performUpkeep manually
          await raffle.performUpkeep([]);

          //now the blockchain is in calculating state

          await expect(
            raffle.enterRaffle({ value: raffleEntranceFee })
          ).to.be.revertedWith("Raffle__NotOpen");
        });
      });
      describe("checkUpkeep", function () {
        it("returns false if people haven't sent any ETH", async function () {
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          //since checkUpkeep is a public function, but not view, calling it gonna start a transaction, but don't want that, we only want to see what it's gonna return, if we were to call it
          //for this, we can use static calls, to see what it would return if called
          //note that we didn't enter the raffle in this "it", so no players mean, no eth sent
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
          assert(!upkeepNeeded);
        });

        it("returns false if raffle isn't open", async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          await raffle.performUpkeep([]); //[] is same as "0x empty bytes object"
          const raffleState = await raffle.getRaffleState();
          //should return false when state is closed
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
          //should be closed
          assert.equal(raffleState.toString(), "1");
          assert.equal(upkeepNeeded, false);
        });
        it("returns false if enough time hasn't passed", async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          //decreasing time now
          const scopedInterval = 1; //value in seconds btw
          //this doesn't work with time travelling back like [interval.toNumber - 1], for some reason
          //but can be tested by increasing less time than the specified interval, like increasing the time only 1 second
          await network.provider.send("evm_increaseTime", [
            Number(scopedInterval),
          ]);
          //another way to do this
          await network.provider.request({ method: "evm_mine", params: [] });
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
          assert(!upkeepNeeded);
        });
        it("returns true if enough time has passed, has players, ETH, and is open", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
          assert(upkeepNeeded);
        });
      });
      describe("performUpkeep", function () {
        it("can only run if checkUpkeep returns true", async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          const tx = await raffle.performUpkeep([]);
          assert(tx);
        });
        it("reverts when checkUpkep is false", async function () {
          await expect(raffle.performUpkeep([])).to.be.revertedWith(
            "Raffle__UpkeepNotNeeded"
          );
          //can also be super specific about reversions
          // await expect(raffle.performUpkeep([])).to.be.revertedWith("Raffle__UpkeepNotNeeded('0x', 0, 0)");
          //basically what paramters we're expecting with the error
        });
        it("updates the raffle state, emits an event and calls the vrf coordinatoor", async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          const txResponse = await raffle.performUpkeep([]);
          const txReceipt = await txResponse.wait(1);
          //because the mock vrf also emits an event
          //then our function emits an event, which is redundant but eh, so ours is gonna be on 1 position
          const requestId = txReceipt.events[1].args.requestId;
          const raffleState = await raffle.getRaffleState();
          assert(requestId.toNumber() > 0);
          assert(raffleState.toString() == "1");
        });

        describe("fulfillRandomWords", function () {
          beforeEach(async function () {
            await raffle.enterRaffle({ value: raffleEntranceFee });
            await network.provider.send("evm_increaseTime", [
              interval.toNumber() + 1,
            ]);
            await network.provider.send("evm_mine", []);
          });

          it("can only be called after requestRandomWords has been called", async function () {
            //the vrf contract throws this error, we're calling fulfulRandomWords before performUpkeep

            //fulfill random words returns nonexistentrequest error if it can't find the number of requests made with a certain request id

            //and since the request id of 0 hasn't made any requests here, it's gonna say that no requests has been made from a subscription having this particular id
            await expect(
              vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
            ).to.be.revertedWith("nonexistent request");
            await expect(
              vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
            ).to.be.revertedWith("nonexistent request");

            //gonna learn fuzz testing in the future
          });

          //the BIGGEST test
          it("picks a winner, resets the lottery and sends money", async function () {
            const additionalEntrants = 3;
            const startAccountIndex = 1; //deployer = 0, so new ones start from 1
            //returns all the signers, as opposed one returned by getSigner()
            const accounts = await ethers.getSigners();
            for (
              let i = startAccountIndex;
              i < startAccountIndex + additionalEntrants;
              i++
            ) {
              const accountConnectedToRaffle = await raffle.connect(
                accounts[i]
              );
              await accountConnectedToRaffle.enterRaffle({
                value: raffleEntranceFee,
              });
            }
            const startingTimeStamp = await raffle.getLatestTimeStamp();

            //call performUpkeep (mock being chainlink keepers)
            //which in turn is gonna call fulfillRandomWords (mock being the chainlink vrf)

            //we can just change blockchain state in hardhat, but we're going to simulate a real network
            //so, we're going to wait for an event to occur
            //put this in the event loop, as soon as the promise revoles, we do something

            //if it doesn't resolve within 200 seconds, consider it rejected
            await new Promise(async (resolve, reject) => {
              //only listends for the event ONCE
              raffle.once("WinnerPicked", async () => {
                console.log("Event Fired!");
                try {
                  const recentWinner = await raffle.getRecentWinner();
                  const raffleState = await raffle.getRaffleState();
                  const endingTimeStamp = await raffle.getLatestTimeStamp();

                  const numPlayers = await raffle.getNumberOfPlayers();
                  console.log("------------------------------------");
                  console.log("Recent Winner: ", recentWinner);
                  console.log("All accounts: \n");
                  console.log(accounts[0].address);
                  console.log(accounts[1].address);
                  console.log(accounts[2].address);
                  console.log(accounts[3].address);
                  console.log("------------------------------------");

                  const winnerEndingBalance = await accounts[1].getBalance();
                  assert.equal(numPlayers.toString(), "0");
                  assert.equal(raffleState.toString(), "0");
                  assert(endingTimeStamp > startingTimeStamp);

                  assert.equal(
                    winnerEndingBalance.toString(),
                    winnerStartingBalance
                      .add(raffleEntranceFee.mul(additionalEntrants)
                      .add(raffleEntranceFee)
                      .toString()
                      )
                  );
                } catch (e) {
                  reject(e);
                }
                resolve();
              });
              // 1. calling performUpkeep (mocking chainlink keepers)
              const tx = await raffle.performUpkeep([]);
              const txReceipt = await tx.wait(1);

              // 2. calling fulfillRandomWords (mocking VRF)
              const winnerStartingBalance = await accounts[1].getBalance();
              await vrfCoordinatorV2Mock.fulfillRandomWords(
                txReceipt.events[1].args.requestId,
                raffle.address
              );
            });
          });
        });
      });
    });
