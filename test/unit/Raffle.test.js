//tests written using Waffle

const { network, ethers, getNamedAccounts, deployments } = require("hardhat")
const {developmentChains, networkConfig} = require("../../helper-hardhat-config")
const { assert } = require("chai")

!developmentChains.includes(network.name) ? describe.skip : describe("Raffle", async function(){
    let raffle, vrfCoordinatorV2Mock 
    const chainId = network.config.chainId

    beforeEach(async function(){
        const {deployer} = await getNamedAccounts();

        //deploy all the contracts
        await deployments.fixture(["all"])
        raffle = await ethers.getContract("Raffle", deployer)
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
    })

    describe('constructor', async function(){
        it("Initializes the raffle correctly", async function(){
            const raffleState = await raffle.getRaffleState();
            const interval = await raffle.getInterval();
            //enum value 0 for open, 1 for closed/calculating
            // stringifying big number returned by blockchain
            assert.equal(raffleState.toString(), "0");
            assert.equal(interval.toString(), networkConfig[chainId]["interval"]);

        })
    })
})