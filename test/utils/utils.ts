import { ethers } from "hardhat";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";
import { ERC20Mock, CoveredVault } from "../../typechain-types";

const { parseEther } = ethers.utils;

export const deposit = async (
  amount: BigNumber,
  signer: SignerWithAddress,
  underlyingAsset: ERC20Mock,
  vault: CoveredVault,
) => {
  await underlyingAsset.mint(signer.address, amount);
  await underlyingAsset.connect(signer).approve(vault.address, amount);
  await vault.connect(signer)["deposit(uint256,address)"](amount, signer.address);
  return vault.balanceOf(signer.address);
};

export const daysToSeconds = (days: number) => days * 24 * 60 * 60;

export const createAccount = async (account: string) => {
  const acc = await ethers.getImpersonatedSigner(account);
  await setBalance(account, parseEther("100"));
  return acc;
};

export const calculateCurrentTrancheId = async () => {
  const lastBlock = await ethers.provider.getBlock("latest");
  return Math.floor(lastBlock.timestamp / (91 * 24 * 3600));
};
