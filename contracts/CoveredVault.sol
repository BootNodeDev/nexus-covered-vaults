// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { AccessManager } from "./vault/AccessManager.sol";
import { SafeERC4626 } from "./vault/SafeERC4626.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title CoveredVault
 * @dev An ERC-4626 vault that invest the assets in an underlying ERC-4626 vault. Invested funds are protected by
 * purchasing coverage on Nexus Mutual.
 */
contract CoveredVault is SafeERC4626, AccessManager {
  using SafeERC20 for IERC20;

  struct ProposedDepositFee {
    uint256 deadline;
    uint256 newFee;
  }

  /**
   * @dev Role for botOperator
   */
  bytes32 public constant BOT_ROLE = keccak256("BOT_ROLE");

  /** @dev Timelock for depositFee application */
  uint256 public constant FEE_TIME_LOCK = 2 weeks;

  /** @dev fee denominator 100% with two decimals */
  uint256 public constant FEE_DENOMINATOR = 1e4;

  /**
   * @dev Address of the underlying vault
   */
  IERC4626 public immutable underlyingVault;

  /**
   * @dev Maximum amount of assets that can be managed by the vault.
   * Helps to protect the growth of the vault and make sure all deposited assets can be invested and insured.
   * Used to calculate the available amount for new deposits.
   */
  uint256 public maxAssetsLimit;

  /**
   * @dev Amount of assets in the vault that are not invested
   */
  uint256 public idleAssets;

  /**
   * @dev Amount of shares of the underlying vault that represents the invested assets
   */
  uint256 public underlyingVaultShares;

  /**
   * @dev Amount of accumulated fees for the admin to claim
   */
  uint256 public accumulatedFees;

  /** @dev Percentage charged to users on deposit on 1e4 units.
   * Helps to avoid short term deposits.
   * After construction is updated with `setDepositFee` and have effect after `applyDepositFee` is called with timelock due.
   */
  uint256 public depositFee;

  ProposedDepositFee public proposedDepositFee;

  /* ========== Events ========== */

  /**
   * @dev Emitted when assets are invested into the underlying vault
   */
  event Invested(uint256 amount, uint256 shares, address sender);

  /**
   * @dev Emitted when shares are uninvested out of the underlying vault
   */
  event UnInvested(uint256 amount, uint256 shares, address sender);

  /**
   * @dev Emitted when the max amount of assets that can be managed by the vault is updated
   */
  event MaxAssetsLimitUpdated(uint256 newLimit);

  /**
   * @dev Emitted when the deposit fee changes effectively
   */
  event DepositFeeUpdated(uint256 newFee);

  /**
   * @dev Emitted when the deposit fee is set to be changed
   */
  event NewDepositFeeProposed(uint256 newFee);

  /* ========== Custom Errors ========== */

  error CoveredVault__FeeOutOfBound();
  error CoveredVault__FeeProposalNotFound();
  error CoveredVault__FeeTimeLockNotDue();

  /* ========== Constructor ========== */

  /**
   * @dev Set the underlying vault contract, name and symbol of the vault.
   * @param _underlyingVault Underlying vault ERC4626-compatible contract
   * @param _name Name of the vault
   * @param _symbol Symbol of the vault
   * @param _admin address' admin operator
   * @param _maxAssetsLimit New maximum asset amount limit
   * @param _depositFee Fee for new deposits
   */
  constructor(
    IERC4626 _underlyingVault,
    string memory _name,
    string memory _symbol,
    address _admin,
    uint256 _maxAssetsLimit,
    uint256 _depositFee
  ) SafeERC4626(IERC20(_underlyingVault.asset()), _name, _symbol) AccessManager(_admin) {
    underlyingVault = _underlyingVault;
    maxAssetsLimit = _maxAssetsLimit;
    depositFee = _depositFee;
  }

  /* ========== User methods ========== */

  /** @dev See {IERC4626-deposit}. */
  function deposit(uint256 _assets, address _receiver) public override whenNotPaused returns (uint256) {
    (uint256 maxAvailableDeposit, uint256 vaultTotalAssets) = _maxDeposit(_receiver);
    if (_assets > maxAvailableDeposit) revert BaseERC4626__DepositMoreThanMax();

    uint256 fee = _calculateFee(_assets, depositFee);
    uint256 newVaultAssets = _assets - fee;

    uint256 shares = _convertToShares(newVaultAssets, Math.Rounding.Down, vaultTotalAssets);
    _deposit(_msgSender(), _receiver, _assets, shares);

    idleAssets += newVaultAssets;
    accumulatedFees += fee;

    return shares;
  }

  /** @dev See {IERC4626-mint}. */
  function mint(uint256 _shares, address _receiver) public override whenNotPaused returns (uint256) {
    (uint256 maxAvailableMint, uint256 vaultTotalAssets) = _maxMint(_receiver);
    if (_shares > maxAvailableMint) revert BaseERC4626__MintMoreThanMax();

    // Calculate the amount of assets that will be accounted for the vault for the shares
    uint256 newVaultAssets = _convertToAssets(_shares, Math.Rounding.Up, vaultTotalAssets);
    // Calculates the amount of assets the user needs to transfer for the required shares and the fees
    uint256 totalAssets = _calculateAmountIncludingFee(newVaultAssets, depositFee);

    _deposit(_msgSender(), _receiver, totalAssets, _shares);
    uint256 fee = totalAssets - newVaultAssets;

    idleAssets += newVaultAssets;
    accumulatedFees += fee;

    return newVaultAssets;
  }

  /** @dev See {IERC4626-withdraw}. */
  function withdraw(
    uint256 _assets,
    address _receiver,
    address _owner
  ) public override whenNotPaused returns (uint256) {
    return super.withdraw(_assets, _receiver, _owner);
  }

  /** @dev See {IERC4626-redeem}. */
  function redeem(uint256 _shares, address _receiver, address _owner) public override whenNotPaused returns (uint256) {
    return super.redeem(_shares, _receiver, _owner);
  }

  /** @dev See {IERC4626-previewDeposit}. */
  function previewDeposit(uint256 assets) public view override returns (uint256) {
    uint256 fee = _calculateFee(assets, depositFee);
    return _convertToShares(assets - fee, Math.Rounding.Down, false);
  }

  /** @dev See {IERC4626-previewMint}. */
  function previewMint(uint256 shares) public view override returns (uint256) {
    uint256 sharesIncludingFee = _calculateAmountIncludingFee(shares, depositFee);

    return _convertToAssets(sharesIncludingFee, Math.Rounding.Up, false);
  }

  /* ========== Admin methods ========== */

  /**
   * @dev Invest idle vault assets into the underlying vault. Only operator roles can call this method.
   * @param _amount Amount of assets to invest
   */
  function invest(uint256 _amount) external onlyAdminOrRole(BOT_ROLE) whenNotPaused {
    IERC20(asset()).approve(address(underlyingVault), _amount);
    uint256 shares = underlyingVault.deposit(_amount, address(this));
    idleAssets -= _amount;
    underlyingVaultShares += shares;

    emit Invested(_amount, shares, msg.sender);
  }

  /**
   * @dev Uninvest active vault assets out of the underlying vault. Only operator roles can call this method.
   * @param _shares Amount of shares to uninvest
   */
  function uninvest(uint256 _shares) external onlyAdminOrRole(BOT_ROLE) whenNotPaused {
    uint256 assets = underlyingVault.redeem(_shares, address(this), address(this));
    idleAssets += assets;
    underlyingVaultShares -= _shares;

    emit UnInvested(assets, _shares, msg.sender);
  }

  /**
   * @dev Sets the maximum amount of assets that can be managed by the vault. Used to calculate the available amount
   * for new deposits.
   * @param _maxAssetsLimit New maximum asset amount limit
   */
  function setMaxAssetsLimit(uint256 _maxAssetsLimit) external onlyRole(DEFAULT_ADMIN_ROLE) {
    maxAssetsLimit = _maxAssetsLimit;

    emit MaxAssetsLimitUpdated(_maxAssetsLimit);
  }

  /**
   * @dev Sets the depositFee to be applied after FEE_TIME_LOCK has passed.
   * @param _depositFee New fee percentage to charge users on deposit
   */
  function setDepositFee(uint256 _depositFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_depositFee > FEE_DENOMINATOR) revert CoveredVault__FeeOutOfBound();

    proposedDepositFee.newFee = _depositFee;
    proposedDepositFee.deadline = block.timestamp + FEE_TIME_LOCK;
  }

  /**
   * @dev Sets the depositFee to his pending value if FEE_TIME_LOCK has passed.
   */
  function applyFee() external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (proposedDepositFee.deadline == 0) revert CoveredVault__FeeProposalNotFound();
    if (block.timestamp < proposedDepositFee.deadline) revert CoveredVault__FeeTimeLockNotDue();

    depositFee = proposedDepositFee.newFee;
    delete proposedDepositFee;
  }

  /**
   * @dev Transfers accumulated fees. Only Admin can call this method
   * @param _to receiver of the claimed fees
   */
  function claimFees(address _to) external onlyRole(DEFAULT_ADMIN_ROLE) {
    uint256 _accumulatedFees = accumulatedFees;
    accumulatedFees = 0;

    IERC20(asset()).safeTransfer(_to, _accumulatedFees);
  }

  /* ========== Internal methods ========== */

  /**
   * @dev Withdraw/redeem common workflow.
   */
  function _withdraw(
    address caller,
    address receiver,
    address owner,
    uint256 assets,
    uint256 shares
  ) internal override {
    if (caller != owner) {
      _spendAllowance(owner, caller, shares);
    }

    _burn(owner, shares);

    if (assets > idleAssets) {
      uint256 amountToWithdraw;

      unchecked {
        amountToWithdraw = assets - idleAssets;
      }

      uint256 sharesBurned = underlyingVault.withdraw(amountToWithdraw, address(this), address(this));
      underlyingVaultShares -= sharesBurned;
      idleAssets = 0;
    } else {
      idleAssets -= assets;
    }

    IERC20(asset()).safeTransfer(receiver, assets);

    emit Withdraw(caller, receiver, owner, assets, shares);
  }

  /** @dev See {IERC4626-maxDeposit}. */
  function _maxDeposit(address) internal view override returns (uint256, uint256) {
    uint256 assets = _totalAssets(false);
    if (assets >= maxAssetsLimit) return (0, assets);

    unchecked {
      return (maxAssetsLimit - assets, assets);
    }
  }

  /** @dev See {IERC4626-totalAssets}. */
  function _totalAssets(bool preview) internal view override returns (uint256) {
    uint256 investedAssets = preview == true
      ? underlyingVault.previewRedeem(underlyingVaultShares)
      : underlyingVault.convertToAssets(underlyingVaultShares);
    return investedAssets + idleAssets;
  }

  /**
   * @dev Calculates the fee to be subtracted from an amount
   * feeAmount = _amount * FeeN / FeeD
   * @param _amount total amount
   * @param _fee fee numerator to be applied
   * @return the quantity of _amount to be considered as a fee
   */
  function _calculateFee(uint256 _amount, uint256 _fee) internal pure returns (uint256) {
    return (_amount * _fee) / FEE_DENOMINATOR;
  }

  /**
   * @dev Calculates the total amount from an amount that already got fees subtracted
   * totalAmount = _amount + feeAmount
   * totalAmount = _amount + totalAmount * FeeN/ FeeD
   * totalAmount - totalAmount * FeeN/ FeeD = _amount
   * totalAmount * (1 - FeeN/ FeeD) = _amount
   * totalAmount = _amount / (1 - FeeN/ FeeD)
   * totalAmount = (_amount / (1 - FeeN/ FeeD)) * (FeeD / FeeD)
   * totalAmount = _amount * FeeD / (FeeD * (1 - FeeN/ FeeD))
   * totalAmount = _amount * FeeD / (FeeD - FeeN)
   * @param _amount amount
   * @param _fee fee numerator to be applied
   * @return the amount from which after subtracting the fee would result in _amount
   */
  function _calculateAmountIncludingFee(uint256 _amount, uint256 _fee) internal pure returns (uint256) {
    return (_amount * FEE_DENOMINATOR) / (FEE_DENOMINATOR - _fee);
  }
}
