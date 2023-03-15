// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ICover, BuyCoverParams, PoolAllocationRequest, CoverData, Product, CoverSegment } from "./interfaces/ICover.sol";
import { IPool } from "./interfaces/IPool.sol";
import { IYieldTokenIncidents } from "./interfaces/IYieldTokenIncidents.sol";

/**
 * @title CoverManager
 * @dev Interacts with Nexus Mutual on behalf of allowed accounts.
 * A Nexus Mutual member MUST transfer the membership to this contract to be able to access the protocol.
 */
contract CoverManager is Ownable, ReentrancyGuard {
  using SafeERC20 for IERC20;

  address public constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  uint256 public constant NEXUS_ETH_ASSET_ID = 0;

  address public immutable cover;
  address public immutable yieldTokenIncident;
  address public immutable pool;

  mapping(address => bool) public allowList;
  mapping(address => mapping(address => uint256)) public funds;

  /* ========== Events ========== */

  event Allowed(address indexed account);
  event Disallowed(address indexed account);
  event Deposit(address indexed sender, address indexed owner, address asset, uint256 amount);
  event Withdraw(address indexed owner, address indexed receiver, address asset, uint256 amount);

  /* ========== Custom Errors ========== */

  error CoverManager_NotAllowed();
  error CoverManager_AlreadyAllowed();
  error CoverManager_AlreadyDisallowed();
  error CoverManager_SendingEthFailed();
  error CoverManager_InsufficientFunds();
  error CoverManager_DepositNotAllowed();
  error CoverManager_NotCoverNFTOwner();

  modifier onlyAllowed() {
    if (!allowList[msg.sender]) revert CoverManager_NotAllowed();
    _;
  }

  /* ========== Constructor ========== */

  /**
   * @dev Initializes the main admin role
   * @param _cover Address of the Cover contract
   * @param _yieldTokenIncident Address of the YieldTokenIncident contract
   */
  constructor(address _cover, address _yieldTokenIncident, address _pool) {
    cover = _cover;
    yieldTokenIncident = _yieldTokenIncident;
    pool = _pool;
  }

  /* ========== Admin methods ========== */

  /**
   * @dev Allows an account to call methods in this contract
   * @param _account Address to allow calling methods
   */
  function addToAllowList(address _account) external onlyOwner {
    if (allowList[_account]) revert CoverManager_AlreadyAllowed();

    allowList[_account] = true;
    emit Allowed(_account);
  }

  /**
   * @dev Remove permission of an account to call methods in this contract
   * @param _account Address to reject calling methods
   */
  function removeFromAllowList(address _account) external onlyOwner {
    if (!allowList[_account]) revert CoverManager_AlreadyDisallowed();

    allowList[_account] = false;
    emit Disallowed(_account);
  }

  /**
   * @dev Return whether a cover has expired or not
   * @param _coverId Id of the cover
   */
  function isCoverExpired(uint256 _coverId) external view returns (bool) {
    uint256 count = ICover(cover).coverSegmentsCount(_coverId);
    CoverSegment memory lastSegment = ICover(cover).coverSegmentWithRemainingAmount(_coverId, count - 1);

    return lastSegment.start + lastSegment.period <= block.timestamp;
  }

  /**
   * @dev Allows to call Cover.buyCover() on Nexus Mutual
   * Use available funds from caller to pay for the premium
   * @param params parameters to call buyCover
   * @param coverChunkRequests pool allocations for buyCover
   */
  function buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata coverChunkRequests
  ) external nonReentrant onlyAllowed returns (uint256 coverId) {
    return
      params.paymentAsset == NEXUS_ETH_ASSET_ID
        ? _buyCoverETH(params, coverChunkRequests)
        : _buyCover(params, coverChunkRequests);
  }

  /**
   * @dev Allows to call Cover.buyCover() using an ERC20 asset as payment asset
   * @param params parameters to call buyCover
   * @param coverChunkRequests pool allocations for buyCover
   */
  function _buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata coverChunkRequests
  ) internal returns (uint256 coverId) {
    address asset = IPool(pool).getAsset(params.paymentAsset).assetAddress;

    if (funds[asset][msg.sender] < params.maxPremiumInAsset) revert CoverManager_InsufficientFunds();

    IERC20(asset).safeApprove(cover, params.maxPremiumInAsset);

    uint256 initialBalance = IERC20(asset).balanceOf(address(this));
    coverId = ICover(cover).buyCover(params, coverChunkRequests);
    uint256 finalBalance = IERC20(asset).balanceOf(address(this));

    // reset allowance to 0 to comply with tokens that implement the anti frontrunning approval fix (ie. USDT)
    IERC20(asset).safeApprove(cover, 0);

    uint256 spent = initialBalance - finalBalance;
    funds[asset][msg.sender] -= spent;

    return coverId;
  }

  /**
   * @dev Allows to call Yield Token Incident to exchange the depegged tokens for the cover asset
   * Caller should give allowance of the deppeged tokens and the cover nft.
   * @param incidentId Index of the incident in YieldTokenIncidents
   * @param coverId Id of the cover to be redeemed
   * @param segmentId Index of the cover's segment that's eligible for redemption
   * @param depeggedTokens The amount of depegged tokens to be swapped for the coverAsset
   * @param payoutAddress Address to receive payout
   * @param optionalParams extra params
   * @return Amount of cover assets paid
   * @return Address of the cover asset
   */
  function redeemCover(
    uint104 incidentId,
    uint32 coverId,
    uint256 segmentId,
    uint256 depeggedTokens,
    address payable payoutAddress,
    bytes calldata optionalParams
  ) external onlyAllowed returns (uint256, address) {
    if (ICover(cover).coverNFT().ownerOf(coverId) != msg.sender) revert CoverManager_NotCoverNFTOwner();

    CoverData memory coverData = ICover(cover).coverData(coverId);
    Product memory product = ICover(cover).products(coverData.productId);
    address yieldTokenAddress = product.yieldTokenAddress;

    IERC20(yieldTokenAddress).safeTransferFrom(msg.sender, address(this), depeggedTokens);
    IERC20(yieldTokenAddress).approve(yieldTokenIncident, depeggedTokens);

    (uint256 payoutAmount, uint8 coverAsset) = IYieldTokenIncidents(yieldTokenIncident).redeemPayout(
      incidentId,
      coverId,
      segmentId,
      depeggedTokens,
      payoutAddress,
      optionalParams
    );

    address asset = IPool(pool).getAsset(coverAsset).assetAddress;

    return (payoutAmount, asset);
  }

  /**
   * @dev Allows to call Cover.buyCover() using ETH as payment asset
   * @param params parameters to call buyCover
   * @param coverChunkRequests pool allocations for buyCover
   */
  function _buyCoverETH(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata coverChunkRequests
  ) internal returns (uint256 coverId) {
    if (funds[ETH_ADDRESS][msg.sender] < params.maxPremiumInAsset) revert CoverManager_InsufficientFunds();

    uint256 initialBalance = address(this).balance;
    coverId = ICover(cover).buyCover{ value: params.amount }(params, coverChunkRequests);
    uint256 finalBalance = address(this).balance;

    uint256 spent = initialBalance - finalBalance;
    funds[ETH_ADDRESS][msg.sender] -= spent;

    return coverId;
  }

  /**
   * @dev Allows depositing assets for paying the cover premiums
   * @param _asset asset deposited
   * @param _amount amount of asset on behalf of _to
   * @param _to address allowed to use deposited assets
   */
  function depositOnBehalf(address _asset, uint256 _amount, address _to) external nonReentrant {
    // Validate _to to avoid losing funds
    if (_to != msg.sender && allowList[_to] == false) revert CoverManager_DepositNotAllowed();

    IERC20(_asset).safeTransferFrom(msg.sender, address(this), _amount);
    funds[_asset][_to] += _amount;

    emit Deposit(msg.sender, _to, _asset, _amount);
  }

  /**
   * @dev Allows to deposit ETH for paying the cover premiums
   * @param _to address allowed to use deposited ETH
   */
  function depositETHOnBehalf(address _to) external payable nonReentrant {
    // Validate _to to avoid losing funds
    if (_to != msg.sender && allowList[_to] == false) revert CoverManager_DepositNotAllowed();

    funds[ETH_ADDRESS][_to] += msg.value;

    emit Deposit(msg.sender, _to, ETH_ADDRESS, msg.value);
  }

  /**
   * @dev Allows to withdraw deposited user' assets and ETH from funds
   * @param _asset asset address to withdraw
   * @param _amount amount to withdraw
   * @param _to address to send withdrawn funds
   */
  function withdraw(address _asset, uint256 _amount, address _to) external nonReentrant {
    funds[_asset][msg.sender] -= _amount;

    if (_asset == ETH_ADDRESS) {
      // solhint-disable-next-line avoid-low-level-calls
      (bool success, ) = address(_to).call{ value: _amount }("");
      if (!success) revert CoverManager_SendingEthFailed();
    } else {
      IERC20(_asset).safeTransfer(_to, _amount);
    }

    emit Withdraw(msg.sender, _to, _asset, _amount);
  }

  /**
   * @dev Used to receive buyCover remaining ETH and cover payments
   */
  receive() external payable {
    // solhint-disable-previous-line no-empty-blocks
  }
}
