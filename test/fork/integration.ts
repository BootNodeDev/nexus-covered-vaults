import { expect } from "chai";
import { ethers } from "hardhat";
import { increase } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";
import { CoveredVaultFactory, CoverManager, ERC4626Mock } from "../../typechain-types";
import { calculateCurrentTrancheId, createAccount, daysToSeconds } from "../utils/utils";

const { parseEther } = ethers.utils;
const { MaxUint256, AddressZero } = ethers.constants;

const nexusV2Addresses = {
  cover: "0xcafeac0fF5dA0A2777d915531bfA6B29d282Ee62",
  pool: "0xcafea112Db32436c2390F5EC988f3aDB96870627",
  yieldTokenIncidents: "0xcafeac831dC5ca0D7ef467953b7822D2f44C8f83",
  assessment: "0xcafeaa5f9c401b7295890f309168Bbb8173690A3",
  stakingPoolFactory: "0xcafeafb97BF8831D95C0FC659b8eB3946B101CB3",
  memberRoles: "0x055CC48f7968FD8640EF140610dd4038e1b03926",
  dai: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  nxm: "0xd7c49cee7e9188cca6ad8ff264c1da2e69d4cf3b",
};
const accounts = ["0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000001"];

describe("Integration tests", function () {
  this.timeout(0);
  describe("Nexus Mutual V2", function () {
    it("Should be able to buy and redeem a cover", async function () {
      // Load Nexus contracts
      const cover = await ethers.getContractAt("ICover", nexusV2Addresses.cover);
      const pool = await ethers.getContractAt("IPool", nexusV2Addresses.pool);
      const yieldTokenIncidents = await ethers.getContractAt(
        "IYieldTokenIncidents",
        nexusV2Addresses.yieldTokenIncidents,
      );
      const stakingPoolFactory = await ethers.getContractAt("IStakingPoolFactory", nexusV2Addresses.stakingPoolFactory);
      const assessment = await ethers.getContractAt("IAssessment", nexusV2Addresses.assessment);
      const memberRoles = await ethers.getContractAt("IMemberRoles", nexusV2Addresses.memberRoles);
      const nxm = await ethers.getContractAt("IERC20", nexusV2Addresses.nxm);

      // Load Nexus related accounts
      const member = await createAccount("0x7Cf6D8a0940344a51E797F5C1e5b654deEEf7C00");
      const abMember = await createAccount("0x87B2a7559d85f4653f13E6546A14189cd5455d45");
      const governance = await createAccount("0x4A5C681dDC32acC6ccA51ac17e9d461e6be87900");

      // Load Dai contract
      const dai = await ethers.getContractAt("IERC20", nexusV2Addresses.dai);
      const daiWhale = await createAccount("0x4aa42145Aa6Ebf72e164C9bBC74fbD3788045016");

      // Load test accounts
      const deployer = await createAccount(accounts[0]);
      const user1 = await createAccount(accounts[1]);

      await dai.connect(daiWhale).transfer(deployer.address, parseEther("10000"));
      await dai.connect(daiWhale).transfer(user1.address, parseEther("10000"));

      // Deploy a yield bearing vault
      const underlyingVault = (await ethers.deployContract(
        "ERC4626Mock",
        [dai.address, "DAI yield token", "ybDAI"],
        deployer,
      )) as ERC4626Mock;

      // Create a product in Nexus for the underlying vault
      await cover.connect(abMember).setProducts([
        {
          productName: "ybDAI yield token",
          productId: MaxUint256,
          ipfsMetadata: "",
          product: {
            productType: 2,
            yieldTokenAddress: underlyingVault.address,
            coverAssets: 2, // DAI
            initialPriceRatio: 1000,
            capacityReductionRatio: 1000,
            useFixedPrice: false,
            isDeprecated: false,
          },
          allowedPools: [],
        },
      ]);

      const productsCount = await cover.productsCount();
      const ybDaiProductId = productsCount.toNumber() - 1;

      const products = [
        {
          productId: ybDaiProductId, // ybDAI
          weight: 100,
          initialPrice: 1000,
          targetPrice: 1000,
        },
      ];

      // Create a Nexus staking pool
      await cover.connect(abMember).createStakingPool(false, 5, 5, products, "description");
      const stakingPoolCount = await stakingPoolFactory.stakingPoolCount();
      const poolId = stakingPoolCount.toNumber();

      const stakingPoolAddress = await cover.stakingPool(poolId);
      const stakingPool = await ethers.getContractAt("IStakingPool", stakingPoolAddress);

      const trancheId = await calculateCurrentTrancheId();

      const stakingPoolDepositAmount = parseEther("100");
      // Deposit funds into the staking pool to enable capacity
      await stakingPool.connect(abMember).depositTo(stakingPoolDepositAmount, trancheId + 4, 0, AddressZero);

      // Deploy Covered Vault related contracts
      const vaultFactory = (await ethers.deployContract("CoveredVaultFactory", deployer)) as CoveredVaultFactory;
      const coverManager = (await ethers.deployContract(
        "CoverManager",
        [cover.address, yieldTokenIncidents.address, pool.address],
        deployer,
      )) as CoverManager;

      // Switch Membership to the coverManager contract
      await nxm.connect(member).approve(memberRoles.address, MaxUint256);
      await memberRoles.connect(member).switchMembership(coverManager.address);

      // Deploy Covered Vault
      let vaultAddress = "";
      await expect(
        vaultFactory.connect(deployer).create(
          underlyingVault.address,
          "ybDAI Covered Vault",
          "cvybDAI",
          deployer.address,
          parseEther("10000"),
          10000,
          ybDaiProductId, //productId
          1, //coverAsset
          coverManager.address,
          0,
          0,
        ),
      )
        .to.emit(vaultFactory, "CoveredVaultCreated")
        .withArgs((createdAddress: string) => {
          vaultAddress = createdAddress;
          return true;
        });

      const vault = await ethers.getContractAt("CoveredVault", vaultAddress);

      // Whitelist Covered Vault in Cover Manager
      await coverManager.connect(deployer).addToAllowList(vault.address);
      await dai.connect(deployer).approve(coverManager.address, parseEther("100"));
      // Deposit Funds for covered vault to use for purchasing cover
      await coverManager.connect(deployer).depositOnBehalf(dai.address, parseEther("100"), vault.address);

      // User deposits into covered vault
      const depositAssets = parseEther("100");
      await dai.connect(user1).approve(vault.address, parseEther("100"));
      await vault.connect(user1)["deposit(uint256,address)"](depositAssets, user1.address);

      // Covered vault buy cover on Nexus
      expect(await vault.coverId()).to.equal(0);
      await vault.connect(deployer).buyCover(parseEther("100"), daysToSeconds(90), parseEther("10"), [
        {
          poolId: poolId,
          skip: false,
          coverAmountInAsset: ethers.utils.parseEther("100"),
        },
      ]);
      expect(await vault.coverId()).to.gt(0);

      // Covered vault invest assets in underlying vault
      await vault.connect(deployer).invest(depositAssets);

      // An incident takes place and is submitted to Nexus
      const { timestamp: currentTime } = await ethers.provider.getBlock("latest");
      const assessmentId = await assessment.getAssessmentsCount();

      let incidentId = 0;

      await expect(
        yieldTokenIncidents
          .connect(governance)
          .submitIncident(ybDaiProductId, parseEther("1"), currentTime, parseEther("1"), ""),
      )
        .to.emit(yieldTokenIncidents, "IncidentSubmitted")
        .withArgs(
          governance.address,
          (id: number) => {
            incidentId = id;
            return true;
          },
          ybDaiProductId,
          parseEther("1"),
        );

      await assessment.connect(abMember).castVotes([assessmentId], [true], ["Assessment data hash"], parseEther("1"));

      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(assessmentId);
      const timeToIncrease = end - currentTime + daysToSeconds(payoutCooldownInDays) + 10;
      await increase(timeToIncrease);

      // Covered Vault cover is redeemed in Nexus
      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(depositAssets);

      await vault.connect(deployer).redeemCover(incidentId, 0, depositAssets, []);

      const amountToBeRedeemed = depositAssets.mul(9).div(10); // 90% of the value
      expect(await vault.idleAssets()).to.equal(amountToBeRedeemed);
      expect(await vault.underlyingVaultShares()).to.equal(0);

      // User withdraw assets
      const balanceBefore = await dai.balanceOf(user1.address);

      await vault.connect(user1)["redeem(uint256,address,address)"](depositAssets, user1.address, user1.address);

      const balanceAfter = await dai.balanceOf(user1.address);
      expect(balanceAfter).to.equal(balanceBefore.add(amountToBeRedeemed));
    });
  });
});
