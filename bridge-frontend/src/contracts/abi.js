// Contract ABIs for Counterstake Bridge

export const EXPORT_ABI = [
  // Events
  "event NewExpatriation(address sender_address, uint amount, int reward, string foreign_address, string data)",
  "event AssistantTransferExecuted(address assistant, address recipient, uint stake, uint paid_amount)",
  
  // View functions
  "function foreign_network() view returns (string)",
  "function foreign_asset() view returns (string)",
  "function settings() view returns (address tokenAddress, uint16 ratio100, uint16 counterstake_coef100, uint32 min_tx_age, uint min_stake, uint large_threshold)",
  "function getRequiredStake(uint amount) view returns (uint)",
  "function governance() view returns (address)",
  "function P3D_PRECOMPILE() view returns (address)",
  
  // State changing functions
  "function initExport(string foreign_network, string foreign_asset)",
  "function initCounterstake(address tokenAddr, uint16 counterstake_coef100, uint16 ratio100, uint large_threshold, uint[] challenging_periods, uint[] large_challenging_periods)",
  "function setupGovernance(address governanceFactory, address votedValueFactory)",
  "function transferToForeignChain(string foreign_address, string data, uint amount, int reward) payable",
];

// ImportWrapper ABI (3DPass specific - replaces Import)
export const IMPORT_WRAPPER_ABI = [
  // Events
  "event NewRepatriation(address sender_address, uint amount, uint reward, string home_address, string data)",
  "event AssistantTransferExecuted(address assistant, address user, uint stake_amount, uint image_amount)",
  
  // View functions
  "function home_network() view returns (string)",
  "function home_asset() view returns (string)",
  "function oracleAddress() view returns (address)",
  "function min_price20() view returns (uint)",
  "function precompileAddress() view returns (address)",
  "function settings() view returns (address tokenAddress, uint16 ratio100, uint16 counterstake_coef100, uint32 min_tx_age, uint min_stake, uint large_threshold)",
  "function getRequiredStake(uint amount) view returns (uint)",
  "function governance() view returns (address)",
  "function P3D_PRECOMPILE() view returns (address)",
  
  // State changing functions
  "function initImportWrapper(string home_network, string home_asset, address precompileAddress, address oracleAddr)",
  "function initCounterstake(address stakeTokenAddr, uint16 counterstake_coef100, uint16 ratio100, uint large_threshold, uint[] challenging_periods, uint[] large_challenging_periods)",
  "function setupGovernance(address governanceFactory, address votedValueFactory)",
  "function setupPrecompileRoles()",
  "function validateOracle(address oracleAddr) view",
  "function setOracle(address oracleAddr)",
  "function validateMinPrice(uint min_price20) pure",
  "function setMinPrice(uint min_price20)",
  "function transferToHomeChain(string home_address, string data, uint amount, uint reward)",
];

// Legacy alias for backward compatibility
export const IMPORT_ABI = IMPORT_WRAPPER_ABI;

export const FACTORY_ABI = [
  // Events
  "event NewExport(address contractAddress, address tokenAddress, string foreign_network, string foreign_asset)",
  "event NewImportWrapper(address contractAddress, string home_network, string home_asset, address precompileAddress, address stakeTokenAddress)",
  
  // View functions
  "function exportMaster() view returns (address)",
  "function importWrapperMaster() view returns (address)",
  
  // State changing functions
  "function createExport(string foreign_network, string foreign_asset, address tokenAddr, uint16 counterstake_coef100, uint16 ratio100, uint large_threshold, uint[] challenging_periods, uint[] large_challenging_periods) returns (address)",
  "function createImportWrapper(string home_network, string home_asset, address precompileAddress, address stakeTokenAddr, address oracleAddr, uint16 counterstake_coef100, uint16 ratio100, uint large_threshold, uint[] challenging_periods, uint[] large_challenging_periods) returns (address)",
];

export const ASSISTANT_FACTORY_ABI = [
  // Events
  "event NewExportAssistant(address contractAddress, address bridgeAddress, address manager, string symbol)",
  "event NewImportWrapperAssistant(address contractAddress, address bridgeAddress, address precompileAddress, string name, string symbol)",
  
  // View functions
  "function exportAssistantMaster() view returns (address)",
  "function importWrapperAssistantMaster() view returns (address)",
  
  // State changing functions
  "function createExportAssistant(address bridgeAddr, address managerAddr, uint16 _management_fee10000, uint16 _success_fee10000, address oracleAddr, uint8 _exponent, string name, string symbol) returns (address)",
  "function createImportWrapperAssistant(address bridgeAddress, address managerAddress, uint16 management_fee10000, uint16 success_fee10000, uint16 swap_fee10000, uint8 exponent, string name, string symbol) returns (address)",
];

export const EXPORT_ASSISTANT_ABI = [
  // Events
  "event NewClaimFor(uint claim_num, address for_address, string txid, uint32 txts, uint amount, int reward, uint stake)",
  "event AssistantChallenge(uint claim_num, uint8 outcome, uint stake)",
  "event NewManager(address previousManager, address newManager)",
  
  // View functions
  "function bridgeAddress() view returns (address)",
  "function tokenAddress() view returns (address)",
  "function managerAddress() view returns (address)",
  "function oracleAddress() view returns (address)",
  "function management_fee10000() view returns (uint16)",
  "function success_fee10000() view returns (uint16)",
  "function exit_fee10000() view returns (uint16)",
  "function exponent() view returns (uint8)",
  "function profit_diffusion_period() view returns (uint)",
  "function ts() view returns (uint)",
  "function profit() view returns (int)",
  "function mf() view returns (uint)",
  "function balance_in_work() view returns (uint)",
  "function balances_in_work(uint) view returns (uint)",
  "function recent_profit() view returns (uint)",
  "function recent_profit_ts() view returns (uint)",
  "function network_fee_compensation() view returns (uint)",
  "function governance() view returns (address)",
  "function getUnavailableProfit() view returns (uint)",
  "function supportsInterface(bytes4) view returns (bool)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  
  // State changing functions
  "function initExportAssistant(address bridgeAddr, address managerAddr, uint16 _management_fee10000, uint16 _success_fee10000, address oracleAddr, uint8 _exponent, string _name, string _symbol)",
  "function claim(string txid, uint32 txts, uint amount, int reward, string sender_address, address recipient_address, string data)",
  "function challenge(uint claim_num, uint8 stake_on, uint stake)",
  "function onReceivedFromClaim(uint claim_num, uint claimed_amount, uint won_stake, string, address, string)",
  "function recordLoss(uint claim_num)",
  "function recordWin(uint claim_num)",
  "function buyShares(uint stake_asset_amount) payable",
  "function redeemShares(uint shares_amount)",
  "function withdrawManagementFee()",
  "function withdrawSuccessFee()",
  "function assignNewManager(address newManager)",
  "function setupGovernance(address governanceFactory, address votedValueFactory)",
  "function validateProfitDiffusionPeriod(uint _profit_diffusion_period)",
  "function setProfitDiffusionPeriod(uint _profit_diffusion_period)",
  "function validateExitFee(uint _exit_fee10000)",
  "function setExitFee(uint _exit_fee10000)",
  "function validateOracle(address oracleAddr)",
  "function setOracle(address oracleAddr)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
];

export const IMPORT_WRAPPER_ASSISTANT_ABI = [
  // Events
  "event NewClaimFor(uint claim_num, address for_address, string txid, uint32 txts, uint amount, int reward, uint stake)",
  "event AssistantChallenge(uint claim_num, uint8 outcome, uint stake)",
  "event NewManager(address previousManager, address newManager)",
  
  // View functions
  "function bridgeAddress() view returns (address)",
  "function tokenAddress() view returns (address)",
  "function precompileAddress() view returns (address)",
  "function managerAddress() view returns (address)",
  "function management_fee10000() view returns (uint16)",
  "function success_fee10000() view returns (uint16)",
  "function swap_fee10000() view returns (uint16)",
  "function exit_fee10000() view returns (uint16)",
  "function exponent() view returns (uint8)",
  "function profit_diffusion_period() view returns (uint)",
  "function ts() view returns (uint)",
  "function profit() view returns (tuple(int stake, int image))",
  "function mf() view returns (tuple(uint stake, uint image))",
  "function balance_in_work() view returns (tuple(uint stake, uint image))",
  "function balances_in_work(uint) view returns (tuple(uint stake, uint image))",
  "function recent_profit() view returns (tuple(uint stake, uint image))",
  "function recent_profit_ts() view returns (uint)",
  "function network_fee_compensation() view returns (uint)",
  "function governance() view returns (address)",
  "function getUnavailableProfit() view returns (tuple(uint stake, uint image))",
  "function supportsInterface(bytes4) view returns (bool)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  
  // State changing functions
  "function initImportWrapperAssistant(address bridgeAddr, address managerAddr, uint16 _management_fee10000, uint16 _success_fee10000, uint16 _swap_fee10000, uint8 _exponent, string _name, string _symbol)",
  "function claim(string txid, uint32 txts, uint amount, int reward, string sender_address, address recipient_address, string data)",
  "function challenge(uint claim_num, uint8 stake_on, uint stake)",
  "function onReceivedFromClaim(uint claim_num, uint claimed_amount, uint won_stake, string, address, string)",
  "function recordLoss(uint claim_num)",
  "function recordWin(uint claim_num)",
  "function buyShares(uint stake_asset_amount, uint image_asset_amount) payable",
  "function redeemShares(uint shares_amount)",
  "function swapImage2Stake(uint image_asset_amount, uint min_amount_out)",
  "function swapStake2Image(uint stake_asset_amount, uint min_amount_out) payable",
  "function withdrawManagementFee()",
  "function withdrawSuccessFee()",
  "function assignNewManager(address newManager)",
  "function setupGovernance(address governanceFactory, address votedValueFactory)",
  "function validateProfitDiffusionPeriod(uint _profit_diffusion_period)",
  "function setProfitDiffusionPeriod(uint _profit_diffusion_period)",
  "function validateSwapFee(uint _swap_fee10000)",
  "function setSwapFee(uint _swap_fee10000)",
  "function validateExitFee(uint _exit_fee10000)",
  "function setExitFee(uint _exit_fee10000)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
];

// Legacy alias for backward compatibility
export const IMPORT_ASSISTANT_ABI = IMPORT_WRAPPER_ASSISTANT_ABI;

export const GOVERNANCE_ABI = [
  // Events
  "event VotedValueAdded(string name, address votedValueAddress)",
  "event VotedValueRemoved(string name, address votedValueAddress)",
  
  // View functions
  "function votedValues(string name) view returns (address)",
  "function getVotedValues() view returns (string[] names, address[] addresses)",
  "function balanceOf(address account) view returns (uint)",
  "function totalSupply() view returns (uint)",
  "function addressBelongsToGovernance(address addr) view returns (bool)",
  "function isUntiedFromAllVotes(address addr) view returns (bool)",
  
  // State changing functions
  "function init(address _governedContractAddress, address _votingTokenAddress)",
  "function addVotedValue(string name, address votedValueAddress)",
  "function removeVotedValue(string name)",
  "function deposit() payable",
  "function deposit(address from, uint amount) payable",
  "function withdraw()",
  "function withdraw(uint amount)",
];

export const VOTED_VALUE_UINT_ABI = [
  // Events
  "event ValueChanged(uint oldValue, uint newValue)",
  "event VoteSubmitted(address indexed voter, uint value, uint weight)",
  
  // View functions
  "function currentValue() view returns (uint)",
  "function governance() view returns (address)",
  "function getVotes() view returns (uint[] values, uint[] weights)",
  
  // State changing functions
  "function vote(uint value)",
  "function commit()",
];

export const VOTED_VALUE_ADDRESS_ABI = [
  // Events
  "event ValueChanged(address oldValue, address newValue)",
  "event VoteSubmitted(address indexed voter, address value, uint weight)",
  
  // View functions
  "function currentValue() view returns (address)",
  "function governance() view returns (address)",
  "function getVotes() view returns (address[] values, uint[] weights)",
  
  // State changing functions
  "function vote(address value)",
  "function commit()",
];

export const ORACLE_ABI = [
  // View functions
  "function getPrice(string asset1, string asset2) view returns (uint num, uint den)",
  
  // State changing functions
  "function setPrice(string asset1, string asset2, uint num, uint den)",
];

// ERC20 Token ABI
export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

// IP3D Interface ABI (exactly matches IP3D.sol interface)
export const IP3D_ABI = [
  "function name() external view returns (string memory)",
  "function symbol() external view returns (string memory)",
  "function decimals() external view returns (uint8)",
  "function totalSupply() external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function transfer(address to, uint256 value) external returns (bool)",
  "function approve(address spender, uint256 value) external returns (bool)",
  "function transferFrom(address from, address to, uint256 value) external returns (bool)",
  
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

// IPrecompileERC20 Interface ABI (exactly matches IPrecompileERC20.sol interface)
export const IPRECOMPILE_ERC20_ABI = [
  "function name() external view returns (string memory)",
  "function symbol() external view returns (string memory)",
  "function decimals() external view returns (uint8)",
  "function totalSupply() external view returns (uint256)",
  "function balanceOf(address who) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function transfer(address to, uint256 value) external returns (bool)",
  "function approve(address spender, uint256 value) external returns (bool)",
  "function transferFrom(address from, address to, uint256 value) external returns (bool)",
  
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

// Counterstake ABI for claim-related functions
export const COUNTERSTAKE_ABI = [
  // View functions
  "function settings() view returns (address tokenAddress, uint16 ratio100, uint16 counterstake_coef100, uint32 min_tx_age, uint min_stake, uint[] challenging_periods, uint[] large_challenging_periods, uint large_threshold)",
  "function last_claim_num() view returns (uint)",
  "function getOngoingClaimNums() view returns (uint[])",
  "function stakes(uint claim_num, uint8 outcome, address account) view returns (uint)",
  "function getClaim(uint claim_num) view returns (tuple(uint amount, address recipient_address, string data, uint expiry_ts, uint8 current_outcome, uint yes_stake, uint no_stake, bool finished, bool withdrawn))",
  "function getChallengingPeriod(uint8 outcome, bool large) view returns (uint)",
  "function governance() view returns (address)",
  "function P3D_PRECOMPILE() view returns (address)",
];