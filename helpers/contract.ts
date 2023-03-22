import { Result } from "@ethersproject/abi";
import { Contract, ContractReceipt } from "ethers";
import hre, { ethers } from "hardhat";

export const deployContract = async <ContractType extends Contract>(
  name: string,
  args: any[],
): Promise<ContractType> => {
  console.log(`\nDeploying ${name} ...`);
  const contract = await ethers.deployContract(name, args);
  console.log("Tx:", contract.deployTransaction.hash);
  await contract.deployed();

  return contract as ContractType;
};

export const getEventArgs = (receipt: ContractReceipt, eventName: string): Result => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const value = receipt.events!.find((e) => e.event === eventName);
  if (value == undefined || value.args == undefined) {
    throw Error();
  }
  return value.args;
};

export const etherscanVerification = (
  contractAddress: string,
  args: (string | string[])[],
  exactContractPath?: string,
) => {
  return runTaskWithRetry(
    "verify:verify",
    {
      address: contractAddress,
      constructorArguments: args,
      contract: exactContractPath,
      noCompile: true,
    },
    4,
    10000,
  );
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry is needed because the contract was recently deployed and it hasn't propagated to the explorer backend yet
export const runTaskWithRetry = async (task: string, params: any, times: number, msDelay: number) => {
  let counter = times;
  await delay(msDelay);

  try {
    await hre.run(task, params);
  } catch (error) {
    counter--;

    if (counter > 0) {
      await runTaskWithRetry(task, params, counter, msDelay);
    } else {
      console.error("[ETHERSCAN][ERROR]", "unable to verify", error.message);
    }
  }
};
