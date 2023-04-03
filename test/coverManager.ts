import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployVaultFixture } from "./utils/fixtures";
import { setNextBlockBaseFeePerGas } from "@nomicfoundation/hardhat-network-helpers";
import { parseEther } from "ethers/lib/utils";

const poolAlloc = {
  poolId: 0,
  skip: false,
  coverAmountInAsset: ethers.utils.parseEther("10"),
};

const buyCoverParams = {
  coverId: 0,
  owner: ethers.constants.AddressZero, // replace
  productId: 1,
  coverAsset: 0,
  amount: ethers.utils.parseEther("10"),
  period: 0,
  maxPremiumInAsset: ethers.utils.parseEther("1"),
  paymentAsset: ethers.constants.AddressZero, // replace
  commissionRatio: 0,
  commissionDestination: ethers.constants.AddressZero,
  ipfsData: "",
};

const product = {
  productType: 1,
  yieldTokenAddress: ethers.constants.AddressZero,
  coverAssets: 0,
  initialPriceRatio: 4,
  capacityReductionRatio: 1,
  isDeprecated: false,
  useFixedPrice: true,
};

const productParam = {
  productName: "test",
  productId: buyCoverParams.productId,
  ipfsMetadata: buyCoverParams.ipfsData,
  product,
  allowedPools: [],
};

describe("CoverManager", function () {
  describe("Deployment", function () {
    it("Should correctly set params", async function () {
      const { cover, coverManager, yieldTokenIncidents } = await loadFixture(deployVaultFixture);

      expect(await coverManager.cover()).to.equal(cover.address);
      expect(await coverManager.yieldTokenIncidents()).to.equal(yieldTokenIncidents.address);
    });
  });

  describe("Access Control", function () {
    it("Should give owner rights to deployer", async function () {
      const { coverManager } = await loadFixture(deployVaultFixture);

      const [, , , owner] = await ethers.getSigners();

      expect(await coverManager.owner()).to.equals(owner.address);
    });

    it("Should revert if addToAllowList is called by anybody but owner", async function () {
      const { coverManager } = await loadFixture(deployVaultFixture);
      const [user1, user2, , owner] = await ethers.getSigners();

      await expect(coverManager.connect(user1).addToAllowList(user2.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );

      await expect(coverManager.connect(owner).addToAllowList(user2.address)).to.not.be.reverted;
    });

    it("Should revert if removeFromAllowList is called by anybody but owner", async function () {
      const { coverManager } = await loadFixture(deployVaultFixture);
      const [user1, user2, , owner] = await ethers.getSigners();

      await expect(coverManager.connect(user1).removeFromAllowList(user2.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );

      await expect(coverManager.connect(owner).addToAllowList(user2.address)).to.not.be.reverted;
    });
  });

  describe("allowed callers", function () {
    it("Should revert if is already allowed", async function () {
      const { coverManager } = await loadFixture(deployVaultFixture);
      const [user1, , , owner] = await ethers.getSigners();

      await coverManager.connect(owner).addToAllowList(user1.address);
      await expect(coverManager.connect(owner).addToAllowList(user1.address)).to.be.revertedWithCustomError(
        coverManager,
        "CoverManager_AlreadyAllowed",
      );
    });

    it("Should revert if is already disallowed", async function () {
      const { coverManager } = await loadFixture(deployVaultFixture);
      const [user1, , , owner] = await ethers.getSigners();

      await expect(coverManager.connect(owner).removeFromAllowList(user1.address)).to.be.revertedWithCustomError(
        coverManager,
        "CoverManager_AlreadyDisallowed",
      );
    });
  });

  describe("Buy Cover", function () {
    it("Should succeed if is called with an ERC20 or ETH", async () => {
      const { coverManager, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      await coverManager.connect(admin).addToAllowList(user1.address);
      await underlyingAsset.mint(admin.address, buyCoverParams.amount);
      await underlyingAsset.connect(admin).approve(coverManager.address, buyCoverParams.amount);
      await coverManager.connect(admin).depositOnBehalf(underlyingAsset.address, buyCoverParams.amount, user1.address);

      await expect(
        coverManager.connect(user1).buyCover({ ...buyCoverParams, owner: user1.address, paymentAsset: 1 }, [poolAlloc]),
      ).to.not.be.reverted;

      await coverManager.connect(admin).depositETHOnBehalf(user1.address, { value: buyCoverParams.amount });
      await coverManager
        .connect(user1)
        .buyCover({ ...buyCoverParams, owner: user1.address, paymentAsset: 0 }, [poolAlloc]);
      await expect(
        coverManager.connect(user1).buyCover({ ...buyCoverParams, owner: user1.address, paymentAsset: 0 }, [poolAlloc]),
      ).to.not.be.reverted;
    });

    it("Should revert if not enough funds to pay premium", async () => {
      const { coverManager, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      await coverManager.connect(admin).addToAllowList(user1.address);
      await underlyingAsset.mint(user1.address, buyCoverParams.maxPremiumInAsset.div(2));
      await underlyingAsset.connect(user1).approve(coverManager.address, buyCoverParams.maxPremiumInAsset.div(2));

      await expect(
        coverManager.connect(user1).buyCover({ ...buyCoverParams, owner: user1.address, paymentAsset: 1 }, [poolAlloc]),
      ).to.be.revertedWithCustomError(coverManager, "CoverManager_InsufficientFunds");
    });

    it("Should substract used funds", async () => {
      const { coverManager, underlyingAsset, cover } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      await coverManager.connect(admin).addToAllowList(user1.address);
      await underlyingAsset.mint(user1.address, ethers.utils.parseEther("1000"));
      await underlyingAsset.connect(user1).approve(coverManager.address, ethers.utils.parseEther("1000"));
      await coverManager.connect(user1).depositOnBehalf(underlyingAsset.address, buyCoverParams.amount, user1.address);

      const premium = await cover.premium();
      const PREMIUM_DENOMINATOR = await cover.PREMIUM_DENOMINATOR();
      const amountToPay = buyCoverParams.amount.mul(premium).div(PREMIUM_DENOMINATOR);
      const fundsBefore = await coverManager.deposits(underlyingAsset.address, user1.address);
      await coverManager
        .connect(user1)
        .buyCover({ ...buyCoverParams, owner: user1.address, paymentAsset: 1 }, [poolAlloc]);
      const fundsAfter = await coverManager.deposits(underlyingAsset.address, user1.address);

      expect(fundsAfter).to.be.eq(fundsBefore.sub(amountToPay));
    });
  });

  describe("redeemCover", function () {
    it("Should revert if caller is not allowed", async () => {
      const { coverManager, cover, underlyingAsset, underlyingVault, yieldTokenIncidents } = await loadFixture(
        deployVaultFixture,
      );
      const [user1, , , owner] = await ethers.getSigners();

      const products = [
        { ...productParam, product: { ...product, yieldTokenAddress: underlyingVault.address } },
        { ...productParam, product: { ...product, yieldTokenAddress: underlyingVault.address } },
      ];

      await cover.setProducts(products);
      await yieldTokenIncidents
        .connect(owner)
        .setPayoutAmount(parseEther("1"), underlyingVault.address, underlyingAsset.address);

      await expect(
        coverManager.connect(user1).redeemCover(1, 1, 0, 100, user1.address, []),
      ).to.be.revertedWithCustomError(coverManager, "CoverManager_NotAllowed");

      await coverManager.connect(owner).addToAllowList(user1.address);

      await coverManager.connect(owner).depositETHOnBehalf(user1.address, { value: buyCoverParams.amount });
      await coverManager
        .connect(user1)
        .buyCover({ ...buyCoverParams, owner: user1.address, paymentAsset: 0 }, [poolAlloc]);

      await underlyingAsset.mint(user1.address, parseEther("100"));
      await underlyingAsset.approve(underlyingVault.address, parseEther("100"));
      await underlyingVault.deposit(parseEther("100"), user1.address);
      await underlyingVault.approve(coverManager.address, parseEther("100"));
      await underlyingAsset.mint(yieldTokenIncidents.address, ethers.utils.parseEther("1000"));

      await expect(coverManager.connect(user1).redeemCover(1, 1, 0, 100, user1.address, [])).to.not.be.reverted;
    });

    it("Should revert if caller is not the owner of coverNFT", async () => {
      const { coverManager, cover, underlyingAsset, underlyingVault, yieldTokenIncidents } = await loadFixture(
        deployVaultFixture,
      );
      const [user1, user2, , owner] = await ethers.getSigners();

      await coverManager.connect(owner).addToAllowList(user1.address);
      await coverManager.connect(owner).addToAllowList(user2.address);

      const products = [
        { ...productParam, product: { ...product, yieldTokenAddress: underlyingVault.address } },
        { ...productParam, product: { ...product, yieldTokenAddress: underlyingVault.address } },
      ];

      await cover.setProducts(products);
      await yieldTokenIncidents
        .connect(owner)
        .setPayoutAmount(parseEther("1"), underlyingVault.address, underlyingAsset.address);

      // coverNFT 1
      await coverManager.connect(owner).depositETHOnBehalf(user1.address, { value: buyCoverParams.amount });
      await coverManager
        .connect(user1)
        .buyCover({ ...buyCoverParams, owner: user1.address, paymentAsset: 0 }, [poolAlloc]);

      // coverNFT 2
      await coverManager.connect(owner).depositETHOnBehalf(user2.address, { value: buyCoverParams.amount });
      await coverManager
        .connect(user2)
        .buyCover({ ...buyCoverParams, owner: user2.address, paymentAsset: 0 }, [poolAlloc]);

      await underlyingAsset.mint(user1.address, parseEther("100"));
      await underlyingAsset.approve(underlyingVault.address, parseEther("100"));
      await underlyingVault.deposit(parseEther("100"), user1.address);
      await underlyingVault.approve(coverManager.address, parseEther("100"));
      await underlyingAsset.mint(yieldTokenIncidents.address, ethers.utils.parseEther("1000"));

      await expect(
        coverManager.connect(user1).redeemCover(1, 2, 0, 100, user1.address, []),
      ).to.be.revertedWithCustomError(coverManager, "CoverManager_NotCoverNFTOwner");

      await expect(coverManager.connect(user1).redeemCover(1, 1, 0, 100, user1.address, [])).to.not.be.reverted;
    });

    it("Should transfer depeggedTokens from the caller", async () => {
      const { coverManager, cover, underlyingAsset, underlyingVault, yieldTokenIncidents } = await loadFixture(
        deployVaultFixture,
      );
      const [user1, , , owner] = await ethers.getSigners();

      await coverManager.connect(owner).addToAllowList(user1.address);

      const products = [
        { ...productParam, product: { ...product, yieldTokenAddress: underlyingVault.address } },
        { ...productParam, product: { ...product, yieldTokenAddress: underlyingVault.address } },
      ];

      const payoutAmount = parseEther("1");
      await cover.setProducts(products);
      await yieldTokenIncidents
        .connect(owner)
        .setPayoutAmount(payoutAmount, underlyingVault.address, underlyingAsset.address);

      // coverNFT 1
      await coverManager.connect(owner).depositETHOnBehalf(user1.address, { value: buyCoverParams.amount });
      await coverManager
        .connect(user1)
        .buyCover({ ...buyCoverParams, owner: user1.address, paymentAsset: 0 }, [poolAlloc]);

      await underlyingAsset.mint(user1.address, buyCoverParams.amount);
      await underlyingAsset.approve(underlyingVault.address, buyCoverParams.amount);
      await underlyingVault.deposit(buyCoverParams.amount, user1.address);
      await underlyingVault.approve(coverManager.address, buyCoverParams.amount);
      await underlyingAsset.mint(yieldTokenIncidents.address, ethers.utils.parseEther("1000"));

      const callerUVBalanceBefore = await underlyingVault.balanceOf(user1.address);
      const callerAssetBalanceBefore = await underlyingAsset.balanceOf(user1.address);

      await coverManager.connect(user1).redeemCover(1, 1, 0, buyCoverParams.amount, user1.address, []);

      const callerUVBalanceAfter = await underlyingVault.balanceOf(user1.address);
      const callerAssetBalanceAfter = await underlyingAsset.balanceOf(user1.address);

      expect(callerUVBalanceAfter).to.eq(callerUVBalanceBefore.sub(buyCoverParams.amount));
      expect(callerAssetBalanceAfter).to.eq(callerAssetBalanceBefore.add(payoutAmount));
    });

    it("Should revert if user balance < depeggedTokens", async () => {
      const { coverManager, cover, underlyingAsset, underlyingVault, yieldTokenIncidents } = await loadFixture(
        deployVaultFixture,
      );
      const [user1, , , owner] = await ethers.getSigners();

      await coverManager.connect(owner).addToAllowList(user1.address);

      const products = [
        { ...productParam, product: { ...product, yieldTokenAddress: underlyingVault.address } },
        { ...productParam, product: { ...product, yieldTokenAddress: underlyingVault.address } },
      ];

      await cover.setProducts(products);
      await yieldTokenIncidents
        .connect(owner)
        .setPayoutAmount(parseEther("1"), underlyingVault.address, underlyingAsset.address);

      // coverNFT 1
      await coverManager.connect(owner).depositETHOnBehalf(user1.address, { value: buyCoverParams.amount });
      await coverManager
        .connect(user1)
        .buyCover({ ...buyCoverParams, owner: user1.address, paymentAsset: 0 }, [poolAlloc]);

      await underlyingAsset.mint(user1.address, buyCoverParams.amount.div(2));
      await underlyingAsset.approve(underlyingVault.address, buyCoverParams.amount.div(2));
      await underlyingVault.deposit(buyCoverParams.amount.div(2), user1.address);
      await underlyingVault.approve(coverManager.address, buyCoverParams.amount.div(2));
      await underlyingAsset.mint(yieldTokenIncidents.address, ethers.utils.parseEther("1000"));

      await expect(coverManager.connect(user1).redeemCover(1, 1, 0, buyCoverParams.amount, user1.address, [])).to.be
        .reverted;
    });
  });

  describe("depositOnBehalf", function () {
    it("Should revert if deposit is not for address != sender and it is not allowed", async () => {
      const { coverManager, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, user2, , admin] = await ethers.getSigners();

      await underlyingAsset.mint(user1.address, ethers.utils.parseEther("1000"));
      await underlyingAsset.mint(user2.address, ethers.utils.parseEther("1000"));

      await underlyingAsset.connect(user1).approve(coverManager.address, ethers.utils.parseEther("1000"));
      await underlyingAsset.connect(user2).approve(coverManager.address, ethers.utils.parseEther("1000"));

      await expect(
        coverManager.connect(user2).depositOnBehalf(underlyingAsset.address, buyCoverParams.amount, user1.address),
      ).to.be.revertedWithCustomError(coverManager, "CoverManager_DepositNotAllowed");

      await coverManager.connect(admin).addToAllowList(user1.address);
      await expect(
        coverManager.connect(user2).depositOnBehalf(underlyingAsset.address, buyCoverParams.amount, user1.address),
      ).to.not.be.reverted;

      // Not allowed but to == msg.sender
      await expect(
        coverManager.connect(user2).depositOnBehalf(underlyingAsset.address, buyCoverParams.amount, user2.address),
      ).to.not.be.reverted;
    });

    it("Should transfer asset amount and increase funds in the same quantity", async () => {
      const { coverManager, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1] = await ethers.getSigners();

      await underlyingAsset.mint(user1.address, ethers.utils.parseEther("1000"));
      await underlyingAsset.connect(user1).approve(coverManager.address, ethers.utils.parseEther("1000"));

      const fundsBefore = await coverManager.deposits(underlyingAsset.address, user1.address);
      const cmBalanceBefore = await underlyingAsset.balanceOf(coverManager.address);
      const user1BalanceBefore = await underlyingAsset.balanceOf(user1.address);

      await coverManager.connect(user1).depositOnBehalf(underlyingAsset.address, buyCoverParams.amount, user1.address);

      const fundsAfter = await coverManager.deposits(underlyingAsset.address, user1.address);
      const cmBalanceAfter = await underlyingAsset.balanceOf(coverManager.address);
      const user1BalanceAfter = await underlyingAsset.balanceOf(user1.address);

      expect(fundsAfter).to.be.eq(fundsBefore.add(buyCoverParams.amount));
      expect(cmBalanceAfter).to.be.eq(cmBalanceBefore.add(buyCoverParams.amount));
      expect(user1BalanceAfter).to.be.eq(user1BalanceBefore.sub(buyCoverParams.amount));
    });

    it("Should emit Deposit event", async () => {
      const { coverManager, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1] = await ethers.getSigners();

      await underlyingAsset.mint(user1.address, ethers.utils.parseEther("1000"));
      await underlyingAsset.connect(user1).approve(coverManager.address, ethers.utils.parseEther("1000"));

      await expect(
        coverManager.connect(user1).depositOnBehalf(underlyingAsset.address, buyCoverParams.amount, user1.address),
      )
        .to.emit(coverManager, "Deposit")
        .withArgs(user1.address, user1.address, underlyingAsset.address, buyCoverParams.amount);
    });
  });

  describe("depositETHOnBehalf", function () {
    it("Should revert if deposit is not for address != sender and it is not allowed", async () => {
      const { coverManager } = await loadFixture(deployVaultFixture);
      const [user1, user2, , admin] = await ethers.getSigners();

      await expect(
        coverManager.connect(user2).depositETHOnBehalf(user1.address, { value: buyCoverParams.amount }),
      ).to.be.revertedWithCustomError(coverManager, "CoverManager_DepositNotAllowed");

      await coverManager.connect(admin).addToAllowList(user1.address);
      await expect(coverManager.connect(user2).depositETHOnBehalf(user1.address, { value: buyCoverParams.amount })).to
        .not.be.reverted;

      // Not allowed but to == msg.sender
      await expect(coverManager.connect(user2).depositETHOnBehalf(user2.address, { value: buyCoverParams.amount })).to
        .not.be.reverted;
    });

    it("Should transfer ETH amount and increase funds in the same quantity", async () => {
      const { coverManager } = await loadFixture(deployVaultFixture);
      const [user1] = await ethers.getSigners();

      const ETH_ADDRESS = await coverManager.ETH_ADDRESS();

      const fundsBefore = await coverManager.deposits(ETH_ADDRESS, user1.address);
      const cmBalanceBefore = await ethers.provider.getBalance(coverManager.address);
      const user1BalanceBefore = await ethers.provider.getBalance(user1.address);

      await setNextBlockBaseFeePerGas(0);
      await coverManager
        .connect(user1)
        .depositETHOnBehalf(user1.address, { value: buyCoverParams.amount, gasPrice: 0 });

      const fundsAfter = await coverManager.deposits(ETH_ADDRESS, user1.address);
      const cmBalanceAfter = await ethers.provider.getBalance(coverManager.address);
      const user1BalanceAfter = await ethers.provider.getBalance(user1.address);

      expect(fundsAfter).to.be.eq(fundsBefore.add(buyCoverParams.amount));
      expect(cmBalanceAfter).to.be.eq(cmBalanceBefore.add(buyCoverParams.amount));
      expect(user1BalanceAfter).to.be.eq(user1BalanceBefore.sub(buyCoverParams.amount));
    });

    it("Should emit Deposit event", async () => {
      const { coverManager } = await loadFixture(deployVaultFixture);
      const [user1] = await ethers.getSigners();

      const ETH_ADDRESS = await coverManager.ETH_ADDRESS();

      await expect(coverManager.connect(user1).depositETHOnBehalf(user1.address, { value: buyCoverParams.amount }))
        .to.emit(coverManager, "Deposit")
        .withArgs(user1.address, user1.address, ETH_ADDRESS, buyCoverParams.amount);
    });
  });

  describe("withdraw", function () {
    it("Should transfer ETH amount back to user and decrease funds in the same quantity", async () => {
      const { coverManager } = await loadFixture(deployVaultFixture);
      const [user1] = await ethers.getSigners();

      const ETH_ADDRESS = await coverManager.ETH_ADDRESS();

      await setNextBlockBaseFeePerGas(0);
      await coverManager
        .connect(user1)
        .depositETHOnBehalf(user1.address, { value: buyCoverParams.amount, gasPrice: 0 });

      const fundsBefore = await coverManager.deposits(ETH_ADDRESS, user1.address);
      const cmBalanceBefore = await ethers.provider.getBalance(coverManager.address);
      const user1BalanceBefore = await ethers.provider.getBalance(user1.address);

      await setNextBlockBaseFeePerGas(0);
      await coverManager.connect(user1).withdraw(ETH_ADDRESS, buyCoverParams.amount, user1.address, { gasPrice: 0 });

      const fundsAfter = await coverManager.deposits(ETH_ADDRESS, user1.address);
      const cmBalanceAfter = await ethers.provider.getBalance(coverManager.address);
      const user1BalanceAfter = await ethers.provider.getBalance(user1.address);

      expect(fundsAfter).to.be.eq(fundsBefore.sub(buyCoverParams.amount));
      expect(cmBalanceAfter).to.be.eq(cmBalanceBefore.sub(buyCoverParams.amount));
      expect(user1BalanceAfter).to.be.eq(user1BalanceBefore.add(buyCoverParams.amount));
    });

    it("Should transfer asset amount back to user and decrease funds in the same quantity", async () => {
      const { coverManager, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1] = await ethers.getSigners();

      await underlyingAsset.mint(user1.address, buyCoverParams.amount);
      await underlyingAsset.connect(user1).approve(coverManager.address, buyCoverParams.amount);

      await coverManager.connect(user1).depositOnBehalf(underlyingAsset.address, buyCoverParams.amount, user1.address);

      const fundsBefore = await coverManager.deposits(underlyingAsset.address, user1.address);
      const cmBalanceBefore = await underlyingAsset.balanceOf(coverManager.address);
      const user1BalanceBefore = await underlyingAsset.balanceOf(user1.address);

      await coverManager.connect(user1).withdraw(underlyingAsset.address, buyCoverParams.amount, user1.address);

      const fundsAfter = await coverManager.deposits(underlyingAsset.address, user1.address);
      const cmBalanceAfter = await underlyingAsset.balanceOf(coverManager.address);
      const user1BalanceAfter = await underlyingAsset.balanceOf(user1.address);

      expect(fundsAfter).to.be.eq(fundsBefore.sub(buyCoverParams.amount));
      expect(cmBalanceAfter).to.be.eq(cmBalanceBefore.sub(buyCoverParams.amount));
      expect(user1BalanceAfter).to.be.eq(user1BalanceBefore.add(buyCoverParams.amount));
    });

    it("Should emit Withdraw event", async () => {
      const { coverManager, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1] = await ethers.getSigners();

      const ETH_ADDRESS = await coverManager.ETH_ADDRESS();

      // deposit underlyingAsset
      await underlyingAsset.mint(user1.address, ethers.utils.parseEther("1000"));
      await underlyingAsset.connect(user1).approve(coverManager.address, ethers.utils.parseEther("1000"));

      await coverManager.connect(user1).depositOnBehalf(underlyingAsset.address, buyCoverParams.amount, user1.address);

      // deposit ETH
      await setNextBlockBaseFeePerGas(0);
      await coverManager
        .connect(user1)
        .depositETHOnBehalf(user1.address, { value: buyCoverParams.amount, gasPrice: 0 });

      // check events
      await expect(coverManager.connect(user1).withdraw(underlyingAsset.address, buyCoverParams.amount, user1.address))
        .to.emit(coverManager, "Withdraw")
        .withArgs(user1.address, user1.address, underlyingAsset.address, buyCoverParams.amount);

      await expect(coverManager.connect(user1).withdraw(ETH_ADDRESS, buyCoverParams.amount, user1.address))
        .to.emit(coverManager, "Withdraw")
        .withArgs(user1.address, user1.address, ETH_ADDRESS, buyCoverParams.amount);
    });
  });
});
