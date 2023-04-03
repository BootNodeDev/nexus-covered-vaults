// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ICover, BuyCoverParams, PoolAllocationRequest, CoverData, Product, CoverSegment } from "./interfaces/ICover.sol";
import { IPool } from "./interfaces/IPool.sol";
import { IYieldTokenIncidents } from "./interfaces/IYieldTokenIncidents.sol";
import { ICoverManager } from "./interfaces/ICoverManager.sol";

/**
 * @title CoverManager
 * @dev Interacts with Nexus Mutual on behalf of allowed accounts.
 * A Nexus Mutual member MUST transfer the membership to this contract to be able to access the protocol.
 */
contract CoverManager is Ownable, ReentrancyGuard, ICoverManager {
  using SafeERC20 for IERC20;

  /* ========== Constants ========== */

  /**
   * @dev Address to represent ETH as an asset
   */
  address public constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  /**
   * @dev ETH asset id in Nexus Mutual contracts
   */
  uint256 public constant NEXUS_ETH_ASSET_ID = 0;

  /* ========== Immutable Variables ========== */

  /**
   * @dev Address Nexus Cover contract
   */
  address public immutable cover;

  /**
   * @dev Address Nexus YieldTokenIncidents contract
   */
  address public immutable yieldTokenIncident;

  /**
   * @dev Address Nexus pool contract
   */
  address public immutable pool;

  /**
   * @dev Stores the addresses that are allowed to use this contract
   */
  mapping(address => bool) public allowList;

  /**
   * @dev Stores the user deposits to be used for purchasing cover
   */
  mapping(address => mapping(address => uint256)) public funds;

  /* ========== Events ========== */

  /**
   * @dev Emitted when a new address is allowed to use this contract
   */
  event Allowed(address indexed account);

  /**
   * @dev Emitted when a new address is disallowed to use this contract
   */
  event Disallowed(address indexed account);

  /**
   * @dev Emitted when user deposits assets
   */
  event Deposit(address indexed sender, address indexed owner, address asset, uint256 amount);

  /**
   * @dev Emitted when a new address is allowed to use this contract
   */
  event Withdraw(address indexed owner, address indexed receiver, address asset, uint256 amount);

  /* ========== Custom Errors ========== */

  error CoverManager_NotAllowed();
  error CoverManager_AlreadyAllowed();
  error CoverManager_AlreadyDisallowed();
  error CoverManager_SendingEthFailed();
  error CoverManager_InsufficientFunds();
  error CoverManager_DepositNotAllowed();
  error CoverManager_NotCoverNFTOwner();

  /* ========== Modifiers ========== */

  modifier onlyAllowed() {
    if (!allowList[msg.sender]) revert CoverManager_NotAllowed();
    _;
  }

  /* ========== Constructor ========== */

  /**
   * @dev Initializes the main admin role
   * @param _cover Address of the Cover contract
   * @param _yieldTokenIncident Address of the YieldTokenIncident contract
   * @param _pool Address of the pool contract
   */
  constructor(address _cover, address _yieldTokenIncident, address _pool) {
    cover = _cover;
    yieldTokenIncident = _yieldTokenIncident;
    pool = _pool;
  }

  /* ========== Allowed methods ========== */

  /**
   * @dev Allows depositing assets for paying the cover premiums
   * @param _asset asset deposited
   * @param _amount amount of asset on behalf of _to
   * @param _to address allowed to use deposited assets
   */
  function depositOnBehalf(address _asset, uint256 _amount, address _to) external nonReentrant {
    // Validate _to to avoid depositing assets for an asset that can't use this contract
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
    // Validate _to to avoid depositing assets for an asset that can't use this contract
    if (_to != msg.sender && allowList[_to] == false) revert CoverManager_DepositNotAllowed();

    funds[ETH_ADDRESS][_to] += msg.value;

    emit Deposit(msg.sender, _to, ETH_ADDRESS, msg.value);
  }

  /**
   * @dev Allows to withdraw deposited assets
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
   * @dev Allows to call Cover.buyCover() on Nexus Mutual
   * Use available deposits from caller to pay for the premium
   * @param _params parameters to call buyCover
   * @param _coverChunkRequests pool allocations for buyCover
   * @return The cover id
   */
  function buyCover(
    BuyCoverParams calldata _params,
    PoolAllocationRequest[] calldata _coverChunkRequests
  ) external nonReentrant onlyAllowed returns (uint256) {
    return
      _params.paymentAsset == NEXUS_ETH_ASSET_ID
        ? _buyCoverETH(_params, _coverChunkRequests)
        : _buyCover(_params, _coverChunkRequests);
  }

  /**
   * @dev Allows to call Yield Token Incident to exchange the depegged tokens for the cover asset
   * Caller should give allowance of the deppeged tokens and the cover nft.
   * @param _incidentId Index of the incident in YieldTokenIncidents
   * @param _coverId Id of the cover to be redeemed
   * @param _segmentId Index of the cover's segment that's eligible for redemption
   * @param _depeggedTokens The amount of depegged tokens to be swapped for the coverAsset
   * @param _payoutAddress Address to receive payout
   * @param _optionalParams extra params
   * @return Amount of cover assets paid
   * @return Address of the cover asset
   */
  function redeemCover(
    uint104 _incidentId,
    uint32 _coverId,
    uint256 _segmentId,
    uint256 _depeggedTokens,
    address payable _payoutAddress,
    bytes calldata _optionalParams
  ) external onlyAllowed returns (uint256, uint8) {
    if (ICover(cover).coverNFT().ownerOf(_coverId) != msg.sender) revert CoverManager_NotCoverNFTOwner();

    CoverData memory coverData = ICover(cover).coverData(_coverId);
    Product memory product = ICover(cover).products(coverData.productId);
    address yieldTokenAddress = product.yieldTokenAddress;

    IERC20(yieldTokenAddress).safeTransferFrom(msg.sender, address(this), _depeggedTokens);

    IERC20(yieldTokenAddress).approve(yieldTokenIncident, _depeggedTokens);

    (uint256 payoutAmount, uint8 coverAsset) = IYieldTokenIncidents(yieldTokenIncident).redeemPayout(
      _incidentId,
      _coverId,
      _segmentId,
      _depeggedTokens,
      _payoutAddress,
      _optionalParams
    );

    return (payoutAmount, coverAsset);
  }

  /**
   * @dev Used to receive buyCover remaining ETH and cover payments
   */
  receive() external payable {
    // solhint-disable-previous-line no-empty-blocks
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

  /* ========== View methods ========== */

  /**
   * @dev Returns whether a cover has expired or not
   * @param _coverId Id of the cover
   * @return True if the cover has expired, false otherwise
   */
  function isCoverExpired(uint256 _coverId) external view returns (bool) {
    CoverSegment memory lastSegment = _getLastCoverSegment(_coverId);

    return _isSegmentExpired(lastSegment);
  }

  /**
   * @dev Returns the active covered amount in asset. Returns 0 if the cover expired
   * @param _coverId Id of the cover
   * @return The active covered amount for the cover id
   */
  function getActiveCoverAmount(uint256 _coverId) external view returns (uint96) {
    CoverSegment memory lastSegment = _getLastCoverSegment(_coverId);

    return _isSegmentExpired(lastSegment) ? 0 : lastSegment.amount;
  }

  /* ========== Internal methods ========== */

  /**
   * @dev Allows to call Cover.buyCover() using an ERC20 asset as payment asset
   * @param _params parameters to call buyCover
   * @param _coverChunkRequests pool allocations for buyCover
   * @return The cover id
   */
  function _buyCover(
    BuyCoverParams calldata _params,
    PoolAllocationRequest[] calldata _coverChunkRequests
  ) internal returns (uint256) {
    address asset = IPool(pool).getAsset(_params.paymentAsset).assetAddress;

    if (funds[asset][msg.sender] < _params.maxPremiumInAsset) revert CoverManager_InsufficientFunds();

    IERC20(asset).safeApprove(cover, _params.maxPremiumInAsset);

    uint256 initialBalance = IERC20(asset).balanceOf(address(this));
    uint256 coverId = ICover(cover).buyCover(_params, _coverChunkRequests);
    uint256 finalBalance = IERC20(asset).balanceOf(address(this));

    // reset allowance to 0 to comply with tokens that implement the anti frontrunning approval fix (ie. USDT)
    IERC20(asset).safeApprove(cover, 0);

    uint256 spent = initialBalance - finalBalance;
    funds[asset][msg.sender] -= spent;

    return coverId;
  }

  /**
   * @dev Allows to call Cover.buyCover() using ETH as payment asset
   * @param _params parameters to call buyCover
   * @param _coverChunkRequests pool allocations for buyCover
   * @return The cover id
   */
  function _buyCoverETH(
    BuyCoverParams calldata _params,
    PoolAllocationRequest[] calldata _coverChunkRequests
  ) internal returns (uint256) {
    if (funds[ETH_ADDRESS][msg.sender] < _params.maxPremiumInAsset) revert CoverManager_InsufficientFunds();

    uint256 initialBalance = address(this).balance;
    uint256 coverId = ICover(cover).buyCover{ value: _params.amount }(_params, _coverChunkRequests);
    uint256 finalBalance = address(this).balance;

    uint256 spent = initialBalance - finalBalance;
    funds[ETH_ADDRESS][msg.sender] -= spent;

    return coverId;
  }

  /**
   * @dev Returns the last segment of the cover
   * @param _coverId Id of the cover
   * @return Struct with the cover segment data
   */
  function _getLastCoverSegment(uint256 _coverId) internal view returns (CoverSegment memory) {
    uint256 count = ICover(cover).coverSegmentsCount(_coverId);
    return ICover(cover).coverSegmentWithRemainingAmount(_coverId, count - 1);
  }

  /**
   * @dev Returns whether a segment has expired or not
   * @param _segment segment data
   * @return True if the cover has expired, false otherwise
   */
  function _isSegmentExpired(CoverSegment memory _segment) internal view returns (bool) {
    return _segment.start + _segment.period <= block.timestamp;
  }
}
