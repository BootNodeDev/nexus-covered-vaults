import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { deployVaultFixture } from "./utils/fixtures";

const vaultName = "USDC Covered Vault";
const vaultSymbol = "cvUSDC";

describe("CoveredVault", function () {
  describe("Deployment", function () {
    it("Should correctly set params", async function () {
      const { vault, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);

      // covered vault properties
      expect(await vault.underlyingVault()).to.equal(underlyingVault.address);
      // erc4626 properties
      expect(await vault.asset()).to.equal(underlyingAsset.address);
      // erc20 properties
      expect(await vault.name()).to.equal(vaultName);
      expect(await vault.symbol()).to.equal(vaultSymbol);
      expect(await vault.decimals()).to.equal(await underlyingAsset.decimals());
      expect(await vault.maxAssetsLimit()).to.equal(ethers.constants.MaxUint256);
    });
  });

  describe("Access Control", function () {
    it("Should give admin rights to admin passed at construction time", async function () {
      const { vault } = await loadFixture(deployVaultFixture);

      const [user1, , , admin] = await ethers.getSigners();

      expect(await vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), admin.address)).to.equals(true);
      expect(await vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), user1.address)).to.equals(false);

      await vault.connect(admin).grantRole(vault.BOT_ROLE(), user1.address);

      expect(await vault.hasRole(vault.BOT_ROLE(), user1.address)).to.equals(true);
      expect(await vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), user1.address)).to.equals(false);
    });
  });

  describe("invest", function () {
    it("Should revert if not admin or bot", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const amount = ethers.utils.parseEther("1000");
      // Mint assets to vault
      await underlyingAsset.mint(vault.address, amount);

      await expect(vault.connect(user1).invest(amount.div(2))).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${await vault.BOT_ROLE()}`,
      );

      await vault.connect(admin).grantRole(await vault.BOT_ROLE(), user1.address);

      await vault.connect(user1).invest(amount.div(2));
      await vault.connect(admin).invest(amount.div(2));
    });

    it("Should revert if paused", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = ethers.utils.parseEther("1000");
      // Mint assets to vault
      await underlyingAsset.mint(vault.address, amount);

      await vault.connect(admin).pause();

      await expect(vault.connect(admin).invest(amount)).to.revertedWith("Pausable: paused");
    });

    it("Should allow to invest all idle assets into the underlying vault", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = ethers.utils.parseEther("1000");
      // Mint assets to vault
      await underlyingAsset.mint(vault.address, amount);

      await expect(vault.connect(admin).invest(amount)).to.changeTokenBalances(
        underlyingAsset,
        [vault.address, underlyingVault.address],
        [amount.mul(-1), amount],
      );
    });

    it("Should allow to invest some idle assets into the underlying vault", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = ethers.utils.parseEther("1000");
      // Mint assets to vault
      await underlyingAsset.mint(vault.address, amount);

      await expect(vault.connect(admin).invest(amount.div(2))).to.changeTokenBalances(
        underlyingAsset,
        [vault.address, underlyingVault.address],
        [amount.div(2).mul(-1), amount.div(2)],
      );
    });

    it("Should revert if trying to invest more assets that the vault has", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = ethers.utils.parseEther("1000");
      // Mint assets to vault
      await underlyingAsset.mint(vault.address, amount);

      await expect(vault.connect(admin).invest(amount.mul(2))).to.be.revertedWith(
        "ERC20: transfer amount exceeds balance",
      );
    });

    it("Should emit an event with amount, shares and caller", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = ethers.utils.parseEther("1000");
      // Mint assets to vault
      await underlyingAsset.mint(vault.address, amount);

      await expect(vault.connect(admin).invest(amount))
        .to.emit(vault, "Invested")
        .withArgs(amount, amount, admin.address);
    });
  });

  describe("uninvest", function () {
    it("Should revert if not admin or bot", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const amount = ethers.utils.parseEther("1000");
      // Mint assets to vault
      await underlyingAsset.mint(vault.address, amount);

      await expect(vault.connect(user1).uninvest(amount.div(2))).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${await vault.BOT_ROLE()}`,
      );

      await vault.connect(admin).grantRole(await vault.BOT_ROLE(), user1.address);

      // Invest to be able to uninvest
      await vault.connect(admin).invest(amount);

      await vault.connect(user1).uninvest(amount.div(2));
      await vault.connect(admin).uninvest(amount.div(2));
    });

    it("Should revert if paused", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = ethers.utils.parseEther("1000");

      await vault.connect(admin).pause();

      await expect(vault.connect(admin).uninvest(amount)).to.revertedWith("Pausable: paused");
    });

    it("Should allow to uninvest all active assets out of the underlying vault", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = ethers.utils.parseEther("1000");
      // Mint assets to vault
      await underlyingAsset.mint(vault.address, amount);
      await vault.connect(admin).invest(amount);

      await expect(vault.connect(admin).uninvest(amount)).to.changeTokenBalances(
        underlyingAsset,
        [vault.address, underlyingVault.address],
        [amount, amount.mul(-1)],
      );
    });

    it("Should allow to uninvest active assets with returns out of the underlying vault", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = ethers.utils.parseEther("1000");
      // Mint assets to vault
      await underlyingAsset.mint(vault.address, amount);

      await vault.connect(admin).invest(amount);

      // 100% yield
      await underlyingAsset.mint(underlyingVault.address, amount);

      await expect(vault.connect(admin).uninvest(amount)).to.changeTokenBalances(
        underlyingAsset,
        [vault.address, underlyingVault.address],
        [amount.mul(2), amount.mul(-2)],
      );
    });

    it("Should emit an event with amount, shares and caller", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = ethers.utils.parseEther("1000");

      // Mint assets to vault and invest them
      await underlyingAsset.mint(vault.address, amount);
      await vault.connect(admin).invest(amount);

      await expect(vault.connect(admin).uninvest(amount))
        .to.emit(vault, "UnInvested")
        .withArgs(amount, amount, admin.address);
    });
  });

  describe("Pausable", function () {
    it("Should be able to pause only by admin", async function () {
      const { vault } = await loadFixture(deployVaultFixture);

      const [botUser, anyUser, , admin] = await ethers.getSigners();
      await vault.connect(admin).grantRole(vault.BOT_ROLE(), botUser.address);

      await expect(vault.connect(botUser).pause()).to.be.reverted;
      await expect(vault.connect(anyUser).pause()).to.be.reverted;
      await vault.connect(admin).pause();
      expect(await vault.connect(admin).paused()).to.equal(true);
    });

    it("Should be able to unpause when paused only by admin", async function () {
      const { vault } = await loadFixture(deployVaultFixture);

      const [botUser, anyUser, , admin] = await ethers.getSigners();
      await vault.connect(admin).grantRole(vault.BOT_ROLE(), botUser.address);
      await vault.connect(admin).pause();

      await expect(vault.connect(botUser).unpause()).to.be.reverted;
      await expect(vault.connect(anyUser).unpause()).to.be.reverted;
      await vault.connect(admin).unpause();
      expect(await vault.connect(admin).paused()).to.equal(false);
    });

    it("Should revert calls to redeem/withdraw/deposit/mint when paused", async function () {
      const amount = "100000";
      const pausedError = "Pausable: paused";

      const { vault, underlyingAsset, underlyingVault } = await loadFixture(deployVaultFixture);

      const [anyUser, , , admin] = await ethers.getSigners();

      await vault.connect(admin).pause();

      // Mint assets
      await underlyingAsset.mint(anyUser.address, ethers.utils.parseEther(amount));
      await underlyingAsset.mint(admin.address, ethers.utils.parseEther(amount));

      // Approve for both vaults
      await underlyingAsset.connect(anyUser).approve(vault.address, ethers.utils.parseEther(amount));
      await underlyingAsset.connect(admin).approve(vault.address, ethers.utils.parseEther(amount));

      await underlyingAsset.connect(anyUser).approve(underlyingVault.address, ethers.utils.parseEther(amount));
      await underlyingAsset.connect(admin).approve(underlyingVault.address, ethers.utils.parseEther(amount));

      // check underlying vault deposit fails with admin-nonAdmin when paused
      await expect(
        vault.connect(anyUser)["deposit(uint256,address)"](ethers.utils.parseEther("1000"), anyUser.address),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault.connect(admin)["deposit(uint256,address)"](ethers.utils.parseEther("1000"), anyUser.address),
      ).to.be.revertedWith(pausedError);

      // check vault deposit fails with admin-nonAdmin when paused
      await expect(
        vault
          .connect(anyUser)
          ["deposit(uint256,address,uint256)"](
            ethers.utils.parseEther("1000"),
            anyUser.address,
            ethers.utils.parseEther("10"),
          ),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault
          .connect(admin)
          ["deposit(uint256,address,uint256)"](
            ethers.utils.parseEther("1000"),
            anyUser.address,
            ethers.utils.parseEther("10"),
          ),
      ).to.be.revertedWith(pausedError);

      // check underlying vault mint fails with admin-nonAdmin when paused
      await expect(
        vault.connect(anyUser)["mint(uint256,address)"](ethers.utils.parseEther("1000"), anyUser.address),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault.connect(admin)["mint(uint256,address)"](ethers.utils.parseEther("1000"), anyUser.address),
      ).to.be.revertedWith(pausedError);

      // check vault mint fails with admin-nonAdmin when paused
      await expect(
        vault
          .connect(anyUser)
          ["mint(uint256,address,uint256)"](
            ethers.utils.parseEther("1000"),
            anyUser.address,
            ethers.utils.parseEther("10"),
          ),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault
          .connect(admin)
          ["mint(uint256,address,uint256)"](
            ethers.utils.parseEther("1000"),
            anyUser.address,
            ethers.utils.parseEther("10"),
          ),
      ).to.be.revertedWith(pausedError);

      // check underlying vault redeem fails with admin-nonAdmin when paused
      await expect(
        vault
          .connect(anyUser)
          ["redeem(uint256,address,address)"](ethers.utils.parseEther("1000"), anyUser.address, anyUser.address),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault
          .connect(admin)
          ["redeem(uint256,address,address)"](ethers.utils.parseEther("1000"), anyUser.address, anyUser.address),
      ).to.be.revertedWith(pausedError);

      // check vault redeem fails with admin-nonAdmin when paused
      await expect(
        vault
          .connect(anyUser)
          ["redeem(uint256,address,address,uint256)"](
            ethers.utils.parseEther("1000"),
            anyUser.address,
            anyUser.address,
            ethers.utils.parseEther("10"),
          ),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault
          .connect(admin)
          ["redeem(uint256,address,address,uint256)"](
            ethers.utils.parseEther("1000"),
            anyUser.address,
            anyUser.address,
            ethers.utils.parseEther("10"),
          ),
      ).to.be.revertedWith(pausedError);

      // check underlying vault withdraw fails with admin-nonAdmin when paused
      await expect(
        vault
          .connect(anyUser)
          ["withdraw(uint256,address,address)"](ethers.utils.parseEther("1000"), anyUser.address, anyUser.address),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault
          .connect(admin)
          ["withdraw(uint256,address,address)"](ethers.utils.parseEther("1000"), anyUser.address, anyUser.address),
      ).to.be.revertedWith(pausedError);

      // check vault withdraw fails with admin-nonAdmin when paused
      await expect(
        vault
          .connect(anyUser)
          ["withdraw(uint256,address,address,uint256)"](
            ethers.utils.parseEther("1000"),
            anyUser.address,
            anyUser.address,
            ethers.utils.parseEther("10"),
          ),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault
          .connect(admin)
          ["withdraw(uint256,address,address,uint256)"](
            ethers.utils.parseEther("1000"),
            anyUser.address,
            anyUser.address,
            ethers.utils.parseEther("10"),
          ),
      ).to.be.revertedWith(pausedError);
    });
  });

  describe("setMaxAssetsLimit", function () {
    it("Should allow only admin to update maxAssetsLimit", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const adminRole = await vault.DEFAULT_ADMIN_ROLE();
      const amount = 100;

      expect(await vault.maxAssetsLimit()).to.not.equal(amount);
      // Try with regular user
      await expect(vault.connect(user1).setMaxAssetsLimit(amount)).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${adminRole}`,
      );

      // Try with bot operator
      await vault.connect(admin).grantRole(await vault.BOT_ROLE(), user1.address);

      await expect(vault.connect(user1).setMaxAssetsLimit(amount)).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${adminRole}`,
      );

      // Try with admin
      await vault.connect(admin).setMaxAssetsLimit(amount);

      expect(await vault.maxAssetsLimit()).to.equal(amount);
    });

    it("Should emit an event", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = 100;

      await expect(vault.connect(admin).setMaxAssetsLimit(amount))
        .to.emit(vault, "MaxAssetsLimitUpdated")
        .withArgs(amount);
    });
  });

  describe("setDepositFee", function () {
    it("Should revert if not admin", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const fee = BigNumber.from(50 * 1e4);

      await expect(vault.connect(user1).setDepositFee(fee)).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${await vault.DEFAULT_ADMIN_ROLE()}`,
      );

      await expect(vault.connect(admin).setDepositFee(fee));
    });

    it("Should revert if proposed fee is bigger than 100%", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const fee = BigNumber.from(101 * 1e4);

      await expect(vault.connect(admin).setDepositFee(fee)).to.revertedWithCustomError(
        vault,
        "CovererdVault__FeeOutOfBound",
      );
    });
  });
});
