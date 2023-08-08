const {developmentChains} = require("../helper-hardhat-config")

const BASE_FEE = ethers.utils.parseEther("0.25"); //The cost per request for random number is 0.25 LINK Tokens

//calculated value based on what chain we're on, what is the current traffic on network
const GAS_PRICE_LINK = 1e9; //1000000000

module.exports = async function({getNamedAccounts, deployments}){
    const {deploy, log} = deployments
    const {deployer} = await getNamedAccounts();
    const args = [BASE_FEE, GAS_PRICE_LINK];

    if(developmentChains.includes(network.name)){
        log("Local network detected! Deploying MOCKS...")

        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            log: true,
            args: args
        })
        log("Mocks deployed successfully!");
        log("------------------------------------")
    }
}

module.exports.tags = ["all", "mocks"]