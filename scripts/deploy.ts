import { ethers } from "hardhat";

async function main() {
  const CoveredVault = await ethers.getContractFactory("CoveredVault");
  const vault = await CoveredVault.deploy();

  await vault.deployed();

  console.log(`Deployed to ${vault.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
