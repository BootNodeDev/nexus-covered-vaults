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
  /** @dev Role for botOperator */
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
  error CovererdVault__FeeOutOfBound();
  error CovererdVault__FeeProposalNotFound();
  error CovererdVault__FeeTimeLockNotDue();

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

    uint256 fee = _calculateFee(_assets);
    uint256 vaultAssets = _assets - fee;

    uint256 shares = _convertToShares(vaultAssets, Math.Rounding.Down, vaultTotalAssets);
    _deposit(_msgSender(), _receiver, _assets, shares);
    idleAssets += vaultAssets;
    _transferFees(fee);

    return shares;
  }

  /** @dev See {IERC4626-mint}. */
  function mint(uint256 _shares, address _receiver) public override whenNotPaused returns (uint256) {
    (uint256 maxAvailableMint, uint256 vaultTotalAssets) = _maxMint(_receiver);
    if (_shares > maxAvailableMint) revert BaseERC4626__MintMoreThanMax();

    uint256 assets = _convertToAssets(_calculateSharesAfterFee(_shares), Math.Rounding.Up, vaultTotalAssets);
    _deposit(_msgSender(), _receiver, assets, _shares);
    uint256 fee = _calculateFee(assets);
    idleAssets += assets - fee;
    _transferFees(fee);

    return assets;
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
    uint256 fee = _calculateFee(assets);
    return _convertToShares(assets - fee, Math.Rounding.Down, false);
  }

  /** @dev See {IERC4626-previewMint}. */
  function previewMint(uint256 shares) public view override returns (uint256) {
    uint256 sharesAfterFee = _calculateSharesAfterFee(shares);

    return _convertToAssets(sharesAfterFee, Math.Rounding.Up, false);
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
    if (_depositFee > FEE_DENOMINATOR) revert CovererdVault__FeeOutOfBound();

    proposedDepositFee.newFee = _depositFee;
    proposedDepositFee.deadline = block.timestamp + FEE_TIME_LOCK;
  }

  /**
   * @dev Sets the depositFee to his pending value if FEE_TIME_LOCK has passed.
   */
  function applyFee() external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (proposedDepositFee.deadline == 0) revert CovererdVault__FeeProposalNotFound();
    if (block.timestamp < proposedDepositFee.deadline) revert CovererdVault__FeeTimeLockNotDue();

    depositFee = proposedDepositFee.newFee;
    delete proposedDepositFee;
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

  /** @dev Get depositFee % of _assets */
  function _calculateFee(uint256 _assets) internal view returns (uint256) {
    return (_assets * depositFee) / FEE_DENOMINATOR;
  }

  /** @dev Get shares amount taking into account fee% */
  function _calculateSharesAfterFee(uint256 _shares) internal view returns (uint256) {
    // shares = assets - assets*fee%
    // shares = assets * (1-fee%)
    // assets = shares / (1-fee%)
    return (_shares * FEE_DENOMINATOR) / (FEE_DENOMINATOR - depositFee);
  }

  /** @dev Transfer underlyingAsset amount of _fee to operator */
  function _transferFees(uint256 _fee) internal returns (bool) {
    return IERC20(asset()).transfer(getRoleMember(DEFAULT_ADMIN_ROLE, 0), _fee);
  }
}
