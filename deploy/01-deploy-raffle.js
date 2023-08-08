const {network, ethers} = require("hardhat");
const { developmentChains, networkConfig } = require("../helper-hardhat-config");
const {verify} = require("../helper-hardhat-config");

const VRF_SUBSCRIPTION_FUND_AMOUNT = ethers.utils.parseEther("30");

module.exports = async function({getNamedAccounts, deployments}){
    const {deploy, log} = deployments;
    const {deployer} = await getNamedAccounts();
    const chainId = network.config.chainId;
    let vrfCoordinatorV2Address, subscriptionId;

    if(developmentChains.includes(network.name)){
        const VRFCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");

        vrfCoordinatorV2Address = VRFCoordinatorV2Mock.address;

        const txResponse = await VRFCoordinatorV2Mock.createSubscription();
        const txReceipt = await txResponse.wait(1);
        
        subscriptionId = txReceipt.events[0].args.subId;

        //Fund the subscription, on real we need LINK Token, on local we do whatever amount we want
        await VRFCoordinatorV2Mock.fundSubscription(
          subscriptionId,
          VRF_SUBSCRIPTION_FUND_AMOUNT
        );

    }
    else{
      //we could do networkConfig[chainId].vrfCoordinatorV2 as well, you get the point
      vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"];

      //now, we could do the subscription and funding for live networks through coding as well, but no. Interface is there for a reason, okay? please use that

      subscriptionId = networkConfig[chainId]["subscriptionId"];
    }

    const entranceFee = networkConfig[chainId]["entranceFee"];
    const gasLane = networkConfig[chainId]["gasLane"];
    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"];
    const interval = networkConfig[chainId]["interval"];


    const args = [vrfCoordinatorV2Address, entranceFee, gasLane, subscriptionId, callbackGasLimit, interval];

    const raffle = await deploy("Raffle", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1
    })

    if(!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY){
        log("Verifying contract....");
        await verify(raffle.address, args);
    }

    log(
      "--------------------------End of Deploy Script--------------------------"
    );
}

module.exports.tags = ["all", "raffle"]