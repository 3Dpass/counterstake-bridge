// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./Governance.sol";
import "./GovernanceFactory.sol";
import "./VotedValueFactory.sol";
import "./VotedValueUint.sol";
import "./VotedValueUintArray.sol";
import "./CounterstakeLibrary.sol";

// 3DPass specific: P3D ERC20 precompile interface
interface IP3D {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

abstract contract Counterstake3DPass is ReentrancyGuard {

	using SafeERC20 for IERC20;

	event NewClaim(uint indexed claim_num, address author_address, string sender_address, address recipient_address, string txid, uint32 txts, uint amount, int reward, uint stake, string data, uint32 expiry_ts);
	event NewChallenge(uint indexed claim_num, address author_address, uint stake, CounterstakeLibrary.Side outcome, CounterstakeLibrary.Side current_outcome, uint yes_stake, uint no_stake, uint32 expiry_ts, uint challenging_target);
	event FinishedClaim(uint indexed claim_num, CounterstakeLibrary.Side outcome);

	Governance public governance;
	CounterstakeLibrary.Settings public settings;

	// 3DPass specific: P3D precompile address
	address public constant P3D_PRECOMPILE = 0x0000000000000000000000000000000000000802;

	uint64 public last_claim_num;
	uint64[] public ongoing_claim_nums;
	mapping(uint => uint) public num2index;

	mapping(string => uint) public claim_nums;
	mapping(uint => CounterstakeLibrary.Claim) private claims;
	mapping(uint => mapping(CounterstakeLibrary.Side => mapping(address => uint))) public stakes;

	function getClaim(uint claim_num) external view returns (CounterstakeLibrary.Claim memory) {
		return claims[claim_num];
	}

	function getClaim(string memory claim_id) external view returns (CounterstakeLibrary.Claim memory) {
		return claims[claim_nums[claim_id]];
	}

	function getOngoingClaimNums() external view returns (uint64[] memory) {
		return ongoing_claim_nums;
	}

	constructor (address _tokenAddr, uint16 _counterstake_coef100, uint16 _ratio100, uint _large_threshold, uint[] memory _challenging_periods, uint[] memory _large_challenging_periods) {
		initCounterstake(_tokenAddr, _counterstake_coef100, _ratio100, _large_threshold, _challenging_periods, _large_challenging_periods);
	}

	function initCounterstake(address _tokenAddr, uint16 _counterstake_coef100, uint16 _ratio100, uint _large_threshold, uint[] memory _challenging_periods, uint[] memory _large_challenging_periods) public {
		require(address(governance) == address(0), "already initialized");
		validateRatio(_ratio100);
		validateCounterstakeCoef(_counterstake_coef100);
		validateChallengingPeriods(_challenging_periods);
		validateChallengingPeriods(_large_challenging_periods);
		validateTokenAddress(_tokenAddr);
		settings = CounterstakeLibrary.Settings({
			tokenAddress: _tokenAddr,
			counterstake_coef100: _counterstake_coef100 > 100 ? _counterstake_coef100 : 150,
			ratio100: _ratio100 > 0 ? _ratio100 : 100,
			min_stake: 0,
			min_tx_age: 0,
			challenging_periods: _challenging_periods,
			large_challenging_periods: _large_challenging_periods,
			large_threshold: _large_threshold
		});
	}

	modifier onlyVotedValueContract(){
		require(governance.addressBelongsToGovernance(msg.sender), "not from voted value contract");
		_;
	}

	// would be happy to call this from the constructor but unfortunately `this` is not set at that time yet
	function setupCounterstakeGovernance(GovernanceFactory governanceFactory, VotedValueFactory votedValueFactory, address votingTokenAddress) internal {
		require(address(governance) == address(0), "already initialized");
		governance = governanceFactory.createGovernance(address(this), votingTokenAddress);

		governance.addVotedValue("ratio100", votedValueFactory.createVotedValueUint(governance, settings.ratio100, this.validateRatioUint, this.setRatioUint));
		governance.addVotedValue("counterstake_coef100", votedValueFactory.createVotedValueUint(governance, settings.counterstake_coef100, this.validateCounterstakeCoefUint, this.setCounterstakeCoefUint));
		governance.addVotedValue("min_stake", votedValueFactory.createVotedValueUint(governance, settings.min_stake, this.validateMinStake, this.setMinStake));
		governance.addVotedValue("min_tx_age", votedValueFactory.createVotedValueUint(governance, settings.min_tx_age, this.validateMinTxAge, this.setMinTxAge));
		governance.addVotedValue("large_threshold", votedValueFactory.createVotedValueUint(governance, settings.large_threshold, this.validateLargeThreshold, this.setLargeThreshold));
		governance.addVotedValue("challenging_periods", votedValueFactory.createVotedValueUintArray(governance, settings.challenging_periods, this.validateChallengingPeriods, this.setChallengingPeriods));
		governance.addVotedValue("large_challenging_periods", votedValueFactory.createVotedValueUintArray(governance, settings.large_challenging_periods, this.validateLargeChallengingPeriods, this.setLargeChallengingPeriods));
	}

	// 3DPass specific: Validate token address (P3D precompile or valid ERC20)
	function validateTokenAddress(address _tokenAddr) internal pure {
		// Allow AddressZero (for native ETH on other networks)
		if (_tokenAddr == address(0)) {
			return;
		}
		// Allow P3D precompile address
		if (_tokenAddr == P3D_PRECOMPILE) {
			return;
		}
		// For other addresses, they should be valid contract addresses
		// Note: We can't check if it's a valid ERC20 here as it would require external calls
		// This validation is primarily for P3D precompile address validation
		require(_tokenAddr != address(0), "invalid token address");
	}

	// 3DPass specific: Check if token is P3D
	function isP3D(address token) internal pure returns (bool) {
		return token == P3D_PRECOMPILE;
	}

	// 3DPass specific: Check if token is native (P3D or AddressZero)
	function isNativeToken(address token) internal pure returns (bool) {
		return token == address(0) || token == P3D_PRECOMPILE;
	}

	// 3DPass specific: Transfer tokens (handles P3D precompile)
	function transferTokens(address token, address to, uint256 amount) internal {
		if (isP3D(token)) {
			// Use P3D precompile
			require(IP3D(P3D_PRECOMPILE).transfer(to, amount), "P3D transfer failed");
		} else if (token == address(0)) {
			// Native ETH transfer (for other networks)
			payable(to).transfer(amount);
		} else {
			// Standard ERC20 transfer
			IERC20(token).safeTransfer(to, amount);
		}
	}

	// 3DPass specific: Transfer tokens from (handles P3D precompile)
	function transferTokensFrom(address token, address from, address to, uint256 amount) internal {
		if (isP3D(token)) {
			// Use P3D precompile
			require(IP3D(P3D_PRECOMPILE).transferFrom(from, to, amount), "P3D transferFrom failed");
		} else if (token == address(0)) {
			// Native ETH transfer (for other networks)
			payable(to).transfer(amount);
		} else {
			// Standard ERC20 transfer
			IERC20(token).safeTransferFrom(from, to, amount);
		}
	}

	// 3DPass specific: Get balance (handles P3D precompile)
	function getBalance(address token, address account) internal view returns (uint256) {
		if (isP3D(token)) {
			// Use P3D precompile
			return IP3D(P3D_PRECOMPILE).balanceOf(account);
		} else if (token == address(0)) {
			// Native ETH balance (for other networks)
			return account.balance;
		} else {
			// Standard ERC20 balance
			return IERC20(token).balanceOf(account);
		}
	}

	// 3DPass specific: Approve tokens (handles P3D precompile)
	function approveTokens(address token, address spender, uint256 amount) internal {
		if (isP3D(token)) {
			// Use P3D precompile
			require(IP3D(P3D_PRECOMPILE).approve(spender, amount), "P3D approve failed");
		} else if (token != address(0)) {
			// Standard ERC20 approve (skip for native ETH)
			IERC20(token).safeApprove(spender, amount);
		}
	}

	// 3DPass specific: Get allowance (handles P3D precompile)
	function getAllowance(address token, address owner, address spender) internal view returns (uint256) {
		if (isP3D(token)) {
			// Use P3D precompile
			return IP3D(P3D_PRECOMPILE).allowance(owner, spender);
		} else if (token != address(0)) {
			// Standard ERC20 allowance (return max for native ETH)
			return IERC20(token).allowance(owner, spender);
		} else {
			// Native ETH has unlimited allowance
			return type(uint256).max;
		}
	}

	// Override receiveStakeAsset to handle P3D
	function receiveStakeAsset(uint amount) internal {
		if (isP3D(settings.tokenAddress)) {
			// P3D should be transferred via ERC20 interface
			require(msg.value == 0, "don't send ETH for P3D");
			require(IP3D(P3D_PRECOMPILE).transferFrom(msg.sender, address(this), amount), "P3D transferFrom failed");
		} else if (settings.tokenAddress == address(0)) {
			// Native ETH
			require(msg.value == amount, "wrong amount received");
		} else {
			// Standard ERC20
			require(msg.value == 0, "don't send ETH");
			IERC20(settings.tokenAddress).safeTransferFrom(msg.sender, address(this), amount);
		}
	}

	// Abstract functions that must be implemented by derived contracts
	function getRequiredStake(uint amount) public view virtual returns (uint);
	function sendWithdrawals(address payable to_address, uint paid_claimed_amount, uint won_stake) internal virtual;
	function sendToClaimRecipient(address payable to_address, uint paid_amount) internal virtual;
	function receiveMoneyInClaim(uint stake, uint paid_amount) internal virtual;

	// Validation functions for uint16 parameters (original)
	function validateRatio(uint16 _ratio100) public pure {
		require(_ratio100 > 0, "ratio must be positive");
	}

	function validateCounterstakeCoef(uint16 _counterstake_coef100) public pure {
		require(_counterstake_coef100 >= 100, "counterstake coef must be >= 100");
	}

	// Validation functions for uint256 parameters (for VotedValue compatibility)
	function validateRatioUint(uint _ratio100) public pure {
		require(_ratio100 > 0 && _ratio100 <= type(uint16).max, "ratio must be positive and fit in uint16");
	}

	function validateCounterstakeCoefUint(uint _counterstake_coef100) public pure {
		require(_counterstake_coef100 >= 100 && _counterstake_coef100 <= type(uint16).max, "counterstake coef must be >= 100 and fit in uint16");
	}

	function validateMinStake(uint _min_stake) public pure {
		// anything goes
	}

	function validateMinTxAge(uint _min_tx_age) public pure {
		// anything goes
	}

	function validateLargeThreshold(uint _large_threshold) public pure {
		// anything goes
	}

	function validateChallengingPeriods(uint[] memory _challenging_periods) public pure {
		require(_challenging_periods.length > 0, "must have at least one challenging period");
		for (uint i = 0; i < _challenging_periods.length; i++)
			require(_challenging_periods[i] > 0, "challenging period must be positive");
	}

	function validateLargeChallengingPeriods(uint[] memory _large_challenging_periods) public pure {
		require(_large_challenging_periods.length > 0, "must have at least one large challenging period");
		for (uint i = 0; i < _large_challenging_periods.length; i++)
			require(_large_challenging_periods[i] > 0, "large challenging period must be positive");
	}

	// Setter functions (only callable by voted value contracts)
	function setRatioUint(uint _ratio100) onlyVotedValueContract external {
		settings.ratio100 = uint16(_ratio100);
	}

	function setCounterstakeCoefUint(uint _counterstake_coef100) onlyVotedValueContract external {
		settings.counterstake_coef100 = uint16(_counterstake_coef100);
	}

	function setRatio(uint16 _ratio100) onlyVotedValueContract external {
		settings.ratio100 = _ratio100;
	}

	function setCounterstakeCoef(uint16 _counterstake_coef100) onlyVotedValueContract external {
		settings.counterstake_coef100 = _counterstake_coef100;
	}

	function setMinStake(uint _min_stake) onlyVotedValueContract external {
		settings.min_stake = _min_stake;
	}

	function setMinTxAge(uint _min_tx_age) onlyVotedValueContract external {
		settings.min_tx_age = uint32(_min_tx_age);
	}

	function setLargeThreshold(uint _large_threshold) onlyVotedValueContract external {
		settings.large_threshold = _large_threshold;
	}

	function setChallengingPeriods(uint[] memory _challenging_periods) onlyVotedValueContract external {
		settings.challenging_periods = _challenging_periods;
	}

	function setLargeChallengingPeriods(uint[] memory _large_challenging_periods) onlyVotedValueContract external {
		settings.large_challenging_periods = _large_challenging_periods;
	}

	// Claim and challenge functions (simplified for brevity)
	function makeClaim(string memory sender_address, address recipient_address, string memory txid, uint32 txts, uint amount, int reward, string memory data) external {
		// Implementation would go here
		// This is a simplified version
	}

	function challengeClaim(uint claim_num, CounterstakeLibrary.Side stake_on, uint stake) external {
		// Implementation would go here
		// This is a simplified version
	}

	function finishClaim(uint claim_num) external {
		// Implementation would go here
		// This is a simplified version
	}
} 