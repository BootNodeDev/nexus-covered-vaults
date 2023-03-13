// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { BuyCoverParams, PoolAllocationRequest } from "./interfaces/ICover.sol";
import { ICoverManager } from "./interfaces/ICoverManager.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { AccessManager } from "./vault/AccessManager.sol";
import { SafeERC4626 } from "./vault/SafeERC4626.sol";

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

  /**
   *  @dev Timelock for depositFee application
   */
  uint256 public constant FEE_TIME_LOCK = 2 weeks;

  /**
   * @dev fee denominator 100% with two decimals
   */
  uint256 public constant FEE_DENOMINATOR = 1e4;

  /**
   * @dev Period over which management fee are calculated
   */
  uint256 public constant FEE_MANAGER_PERIOD = 365 days;

  /**
   * @dev CoverId assigned on buyCover
   */
  uint256 public coverId;

  /**
   * @dev Address of the underlying vault
   */
  IERC4626 public immutable underlyingVault;

  /**
   * @dev Id of the nexus product id
   */
  uint24 public immutable productId;

  /**
   * @dev Address of the cover manager contract
   */
  ICoverManager public immutable coverManager;

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
   * @dev Amount of accumulated fees in asset for the admin to claim
   */
  uint256 public accumulatedAssetFees;

  /**
   * @dev Amount of accumulated fees in underlying vault shares for the admin to claim
   */
  uint256 public accumulatedUVSharesFees;

  /**
   * @dev Percentage charged to users on deposit on 1e4 units.
   * Helps to avoid short term deposits.
   * After construction is updated with `setDepositFee` and have effect after `applyDepositFee` is called with timelock due.
   */
  uint256 public depositFee;

  /**
   * @dev Annually percentage fee charged on invested assets.
   * After construction is updated with `setDepositFee` and have effect after `applyDepositFee` is called with timelock due.
   */
  uint256 public managementFee;

  /**
   * @dev Tracks the last timestamp until management fees were accrued
   */
  uint256 public lastManagementFeesUpdate;

  /**
   * @dev New proposed deposit fee
   */
  ProposedDepositFee public proposedDepositFee;

  /**
   * @dev New proposed management fee
   */
  ProposedDepositFee public proposedManagementFee;

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

  /**
   * @dev Emitted when the management fee changes effectively
   */
  event ManagementFeeUpdated(uint256 newFee);

  /**
   * @dev Emitted when the management fee is set to be changed
   */
  event NewManagementFeeProposed(uint256 newFee);

  /**
   * @dev Emitted when the assets are accounted as fee for the manager
   */
  event FeeAccrued(address asset, uint256 amount);

  /* ========== Custom Errors ========== */

  error CoveredVault__FeeOutOfBound();
  error CoveredVault__FeeProposalNotFound();
  error CoveredVault__FeeTimeLockNotDue();
  error CoveredVault__NoFeesToClaim();
  error CoveredVault__WithdrawMoreThanMax();

  /* ========== Constructor ========== */

  /**
   * @dev Set the underlying vault contract, name and symbol of the vault.
   * @param _underlyingVault Underlying vault ERC4626-compatible contract
   * @param _name Name of the vault
   * @param _symbol Symbol of the vault
   * @param _admin address of admin operator
   * @param _maxAssetsLimit New maximum asset amount limit
   * @param _productId id of covered product
   * @param _coverManager address of cover manager contract
   * @param _depositFee Fee for new deposits
   * @param _managementFee Fee for managed assets
   */
  constructor(
    IERC4626 _underlyingVault,
    string memory _name,
    string memory _symbol,
    address _admin,
    uint256 _maxAssetsLimit,
    uint24 _productId,
    ICoverManager _coverManager,
    uint256 _depositFee,
    uint256 _managementFee
  ) SafeERC4626(IERC20(_underlyingVault.asset()), _name, _symbol) AccessManager(_admin) {
    underlyingVault = _underlyingVault;
    maxAssetsLimit = _maxAssetsLimit;
    productId = _productId;
    coverManager = _coverManager;
    depositFee = _depositFee;
    managementFee = _managementFee;

    emit DepositFeeUpdated(_depositFee);
    emit ManagementFeeUpdated(_managementFee);
  }

  /* ========== User methods ========== */

  /** @dev See {IERC4626-deposit}. */
  function deposit(uint256 _assets, address _receiver) public override whenNotPaused returns (uint256) {
    (uint256 maxAvailableDeposit, uint256 vaultTotalAssets) = _maxDeposit(_receiver);
    if (_assets > maxAvailableDeposit) revert BaseERC4626__DepositMoreThanMax();

    _updateAssets();

    uint256 fee = _calculateDepositFee(_assets, depositFee);
    uint256 newVaultAssets = _assets - fee;

    uint256 shares = _convertToShares(newVaultAssets, Math.Rounding.Down, vaultTotalAssets);
    _deposit(_msgSender(), _receiver, _assets, shares);

    idleAssets += newVaultAssets;
    accumulatedAssetFees += fee;

    emit FeeAccrued(address(asset()), fee);

    return shares;
  }

  /** @dev See {IERC4626-mint}. */
  function mint(uint256 _shares, address _receiver) public override whenNotPaused returns (uint256) {
    (uint256 maxAvailableMint, uint256 vaultTotalAssets) = _maxMint(_receiver);
    if (_shares > maxAvailableMint) revert BaseERC4626__MintMoreThanMax();

    _updateAssets();

    // Calculate the amount of assets that will be accounted for the vault for the shares
    uint256 newVaultAssets = _convertToAssets(_shares, Math.Rounding.Up, vaultTotalAssets);
    // Calculates the amount of assets the user needs to transfer for the required shares and the fees
    uint256 totalAssets = _calculateAmountIncludingDepositFee(newVaultAssets, depositFee);

    _deposit(_msgSender(), _receiver, totalAssets, _shares);
    uint256 fee = totalAssets - newVaultAssets;

    idleAssets += newVaultAssets;
    accumulatedAssetFees += fee;

    emit FeeAccrued(address(asset()), fee);

    return newVaultAssets;
  }

  /** @dev See {IERC4626-withdraw}. */
  function withdraw(
    uint256 _assets,
    address _receiver,
    address _owner
  ) public override whenNotPaused returns (uint256) {
    if (_assets > maxWithdraw(_owner)) revert CoveredVault__WithdrawMoreThanMax();

    _updateAssets();

    uint256 shares = _convertToShares(_assets, Math.Rounding.Up, true, false);
    _withdraw(_msgSender(), _receiver, _owner, _assets, shares);

    return shares;
  }

  /** @dev See {IERC4626-redeem}. */
  function redeem(uint256 _shares, address _receiver, address _owner) public override whenNotPaused returns (uint256) {
    require(_shares <= maxRedeem(_owner), "ERC4626: redeem more than max");

    _updateAssets();

    uint256 assets = _convertToAssets(_shares, Math.Rounding.Down, true, false);
    _withdraw(_msgSender(), _receiver, _owner, assets, _shares);

    return assets;
  }

  /** @dev See {IERC4626-previewDeposit}. */
  function previewDeposit(uint256 assets) public view override returns (uint256) {
    uint256 fee = _calculateDepositFee(assets, depositFee);

    return _convertToShares(assets - fee, Math.Rounding.Down, false, true);
  }

  /** @dev See {IERC4626-previewMint}. */
  function previewMint(uint256 shares) public view override returns (uint256) {
    uint256 sharesIncludingFee = _calculateAmountIncludingDepositFee(shares, depositFee);

    return _convertToAssets(sharesIncludingFee, Math.Rounding.Up, false, true);
  }

  /** @dev See {IERC4626-previewWithdraw}. */
  function previewWithdraw(uint256 assets) public view override returns (uint256) {
    return _convertToShares(assets, Math.Rounding.Up, true, true);
  }

  /** @dev See {IERC4626-previewRedeem}. */
  function previewRedeem(uint256 shares) public view override returns (uint256) {
    return _convertToAssets(shares, Math.Rounding.Down, true, true);
  }

  /* ========== Admin methods ========== */

  /**
   * @dev Purchase cover with this contract as owner
   * @param params buyCoverParams but replacing owner and productId for this contract address and defined productId
   * @param coverChunkRequests pool allocations for buyCover
   */
  function buyCover(
    BuyCoverParams memory params,
    PoolAllocationRequest[] memory coverChunkRequests
  ) external onlyAdminOrRole(BOT_ROLE) whenNotPaused {
    params.owner = address(this);
    params.productId = productId;
    params.coverId = coverId;

    uint256 newCoverId = ICoverManager(coverManager).buyCover(params, coverChunkRequests);

    if (coverId == 0) {
      coverId = newCoverId;
    }
  }

  /**
   * @dev Invest idle vault assets into the underlying vault. Only operator roles can call this method.
   * @param _amount Amount of assets to invest
   */
  function invest(uint256 _amount) external onlyAdminOrRole(BOT_ROLE) whenNotPaused {
    // calculate management fees
    uint256 fee = _calculateManagementFee(underlyingVaultShares);

    // deposit assets
    IERC20(asset()).approve(address(underlyingVault), _amount);
    uint256 shares = underlyingVault.deposit(_amount, address(this));

    // update vault assets accounting
    idleAssets -= _amount;
    underlyingVaultShares = underlyingVaultShares + shares - fee;

    // update accumulated fees
    lastManagementFeesUpdate = block.timestamp;

    if (fee > 0) {
      _accrueManagementFees(fee);
    }

    emit Invested(_amount, shares, msg.sender);
  }

  /**
   * @dev Uninvest active vault assets out of the underlying vault. Only operator roles can call this method.
   * @param _shares Amount of shares to uninvest
   */
  function uninvest(uint256 _shares) external onlyAdminOrRole(BOT_ROLE) whenNotPaused {
    // calculate management fees
    uint256 fee = _calculateManagementFee(underlyingVaultShares);

    // calculate available amount of shares
    uint256 sharesAfterFees = underlyingVaultShares - fee;
    uint256 redeemedShares = Math.min(_shares, sharesAfterFees);

    // redeem shares
    uint256 assets = underlyingVault.redeem(redeemedShares, address(this), address(this));

    // update vault assets accounting
    idleAssets += assets;
    underlyingVaultShares = sharesAfterFees - redeemedShares;

    // update accumulated fees
    lastManagementFeesUpdate = block.timestamp;

    if (fee > 0) {
      _accrueManagementFees(fee);
    }

    emit UnInvested(assets, redeemedShares, msg.sender);
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

    emit NewDepositFeeProposed(_depositFee);
  }

  /**
   * @dev Sets the managementFee to be applied after FEE_TIME_LOCK has passed.
   * @param _managementFee New fee percentage to charge users on invested assets
   */
  function setManagementFee(uint256 _managementFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_managementFee > FEE_DENOMINATOR) revert CoveredVault__FeeOutOfBound();

    proposedManagementFee.newFee = _managementFee;
    proposedManagementFee.deadline = block.timestamp + FEE_TIME_LOCK;

    emit NewManagementFeeProposed(_managementFee);
  }

  /**
   * @dev Sets the depositFee to its pending value if FEE_TIME_LOCK has passed.
   */
  function applyDepositFee() external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (proposedDepositFee.deadline == 0) revert CoveredVault__FeeProposalNotFound();
    if (block.timestamp < proposedDepositFee.deadline) revert CoveredVault__FeeTimeLockNotDue();

    depositFee = proposedDepositFee.newFee;
    delete proposedDepositFee;

    emit DepositFeeUpdated(depositFee);
  }

  /**
   * @dev Sets the managementFee to its pending value if FEE_TIME_LOCK has passed.
   */
  function applyManagementFee() external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (proposedManagementFee.deadline == 0) revert CoveredVault__FeeProposalNotFound();
    if (block.timestamp < proposedManagementFee.deadline) revert CoveredVault__FeeTimeLockNotDue();

    // calculate management fees
    uint256 fee = _calculateManagementFee(underlyingVaultShares);
    underlyingVaultShares = underlyingVaultShares - fee;

    // update accumulated fees
    lastManagementFeesUpdate = block.timestamp;

    if (fee > 0) {
      _accrueManagementFees(fee);
    }

    managementFee = proposedManagementFee.newFee;
    delete proposedManagementFee;

    emit ManagementFeeUpdated(managementFee);
  }

  /**
   * @dev Transfers accumulated fees. Only Admin can call this method
   * @param _to receiver of the claimed fees
   */
  function claimFees(address _to) external onlyRole(DEFAULT_ADMIN_ROLE) {
    uint256 _accumulatedAssetFees = accumulatedAssetFees;
    uint256 _accumulatedUVSharesFees = accumulatedUVSharesFees;

    if (_accumulatedAssetFees == 0 && _accumulatedUVSharesFees == 0) revert CoveredVault__NoFeesToClaim();

    accumulatedAssetFees = 0;
    accumulatedUVSharesFees = 0;

    if (_accumulatedAssetFees > 0) {
      IERC20(asset()).safeTransfer(_to, _accumulatedAssetFees);
    }

    if (_accumulatedUVSharesFees > 0) {
      IERC20(underlyingVault).safeTransfer(_to, _accumulatedUVSharesFees);
    }
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
    uint256 assets = _totalAssets(false, true);
    if (assets >= maxAssetsLimit) return (0, assets);

    unchecked {
      return (maxAssetsLimit - assets, assets);
    }
  }

  /** @dev See {IERC4626-totalAssets}. */
  function _totalAssets(bool _preview, bool accountForFees) internal view override returns (uint256) {
    uint256 _underlyingVaultShares = underlyingVaultShares;

    if (accountForFees) {
      uint256 fee = _calculateManagementFee(underlyingVaultShares);

      _underlyingVaultShares -= fee;
    }

    uint256 investedAssets = _preview == true
      ? underlyingVault.previewRedeem(_underlyingVaultShares)
      : underlyingVault.convertToAssets(_underlyingVaultShares);
    return investedAssets + idleAssets;
  }

  /**
   * @dev Calculates the fee to be subtracted from an amount
   * feeAmount = _amount * FeeN / FeeD
   * @param _amount total amount
   * @param _fee fee numerator to be applied
   * @return the quantity of _amount to be considered as a fee
   */
  function _calculateDepositFee(uint256 _amount, uint256 _fee) internal pure returns (uint256) {
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
  function _calculateAmountIncludingDepositFee(uint256 _amount, uint256 _fee) internal pure returns (uint256) {
    return (_amount * FEE_DENOMINATOR) / (FEE_DENOMINATOR - _fee);
  }

  /**
   * @dev Calculates the fee to be subtracted from an amount
   * feeAmount = _amount * secondsSinceLastUpdate * FeeN / FeeD / feePeriod
   * @param _amount total amount
   * @return the quantity of _amount to be considered as a fee
   */
  function _calculateManagementFee(uint256 _amount) internal view returns (uint256) {
    uint256 secondsSinceLastUpdate = block.timestamp - lastManagementFeesUpdate;
    return (_amount * secondsSinceLastUpdate * managementFee) / FEE_DENOMINATOR / FEE_MANAGER_PERIOD;
  }

  function _accrueManagementFees(uint256 _amount) internal {
    accumulatedUVSharesFees += _amount;

    emit FeeAccrued(address(underlyingVault), _amount);
  }

  function _updateAssets() internal {
    uint256 fee = _calculateManagementFee(underlyingVaultShares);
    lastManagementFeesUpdate = block.timestamp;

    if (fee > 0) {
      _accrueManagementFees(fee);
    }
  }
}
