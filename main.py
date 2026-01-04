
import os
import time
import logging
from logging.handlers import RotatingFileHandler
from dotenv import load_dotenv
from pybit.unified_trading import HTTP
import ai_agent

# Load environment variables
load_dotenv()

# Configure logging
log_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
log_file = 'trading_bot.log'
file_handler = RotatingFileHandler(log_file, maxBytes=10*1024*1024, backupCount=5)
file_handler.setFormatter(log_formatter)
stream_handler = logging.StreamHandler()
stream_handler.setFormatter(log_formatter)
logger = logging.getLogger()
logger.setLevel(logging.INFO)
logger.addHandler(file_handler)
logger.addHandler(stream_handler)

# Constants
SYMBOL = "BTCUSDT"
LEVERAGE = "1"
MAX_LEVERAGE = 10 # Guardrail for max leverage
DECISION_THRESHOLD = 0.5 # Example threshold for AI decision confidence

def main():
    """Main loop for the trading bot."""
    logger.info("Starting trading bot...")
    api_key = os.getenv("BYBIT_API_KEY")
    api_secret = os.getenv("BYBIT_API_SECRET")

    if not api_key or not api_secret:
        logger.error("API key and secret not found. Please check your .env file.")
        return

    session = HTTP(testnet=False, api_key=api_key, api_secret=api_secret)
    
    while True:
        try:
            logger.info("="*30)
            logger.info("Starting new trading cycle...")

            # 1. Get Market Data
            market_data = get_market_data(session)
            
            # 2. Get AI Decision
            ai_decision_data = ai_agent.get_ai_decision(market_data)
            logger.info(f"AI decision received: {ai_decision_data}")

            # 3. Execute Decision
            execute_decision(session, ai_decision_data)

            logger.info("Trading cycle finished. Waiting for 15 minutes.")
            time.sleep(900) # 15 minutes

        except Exception as e:
            logger.error(f"An error occurred in the main loop: {e}", exc_info=True)
            time.sleep(60) # Wait for a minute before retrying

def get_market_data(session):
    """Fetches market data for the symbol."""
    logger.info("Fetching market data...")
    response = session.get_kline(category="linear", symbol=SYMBOL, interval=15)
    if response['retCode'] == 0 and response['result']['list']:
        logger.info("Market data fetched successfully.")
        return response['result']['list']
    else:
        logger.error(f"Failed to fetch market data: {response.get('retMsg', 'Unknown error')}")
        return None

def execute_decision(session, decision_data):
    """Executes the trading decision from the AI."""
    logger.info("Executing decision...")
    decision = decision_data.get("decision")
    leverage = decision_data.get("leverage", LEVERAGE)
    stop_loss = decision_data.get("stop_loss")
    
    # Leverage guardrail
    if float(leverage) > MAX_LEVERAGE:
        logger.warning(f"AI suggested leverage {leverage} exceeds max guardrail {MAX_LEVERAGE}. Capping to {MAX_LEVERAGE}.")
        leverage = str(MAX_LEVERAGE)

    # Simplified logic for placing orders based on decision
    if decision == "NEW_LONG":
        logger.info("AI suggests NEW_LONG. Placing order.")
        _place_order_common(session, "Buy", stop_loss, leverage)
    elif decision == "NEW_SHORT":
        logger.info("AI suggests NEW_SHORT. Placing order.")
        _place_order_common(session, "Sell", stop_loss, leverage)
    elif decision == "HOLD":
        logger.info("AI suggests HOLD. No action taken.")
    elif decision == "CLOSE":
        logger.info("AI suggests CLOSE. Closing position.")
        # NOTE: Simplified closing logic. Assumes only one position to close.
        close_response = session.place_order(
            category="linear",
            symbol=SYMBOL,
            side="Buy" if get_current_position_side(session) == "Sell" else "Sell",
            orderType="Market",
            qty="0", # pybit handles closing with qty 0
            reduceOnly=True,
        )
        logger.info(f"Close order response: {close_response}")
    else:
        logger.warning(f"Unknown AI decision: {decision}")

def _place_order_common(session, side, stop_loss, leverage):
    """A common function to place long or short orders."""
    try:
        # Set leverage
        session.set_leverage(category="linear", symbol=SYMBOL, buyLeverage=leverage, sellLeverage=leverage)
        logger.info(f"Leverage set to {leverage}x for {SYMBOL}")
        
        # Get last price to determine quantity and validate stop-loss
        ticker_info = session.get_tickers(category="linear", symbol=SYMBOL)
        last_price = float(ticker_info["result"]["list"][0]["lastPrice"])
        
        # --- START: Stop-Loss Guardrail ---
        if stop_loss:
            stop_loss = float(stop_loss)
            # For a short position, stop-loss must be HIGHER than entry price
            if side == "Sell" and stop_loss < last_price:
                original_sl = stop_loss
                stop_loss = last_price * 1.02  # Set SL 2% above entry
                logger.warning(f"Invalid stop-loss {original_sl} for SHORT ignored. AI suggested SL below entry price {last_price}. Adjusted to {stop_loss}.")
            
            # For a long position, stop-loss must be LOWER than entry price
            elif side == "Buy" and stop_loss > last_price:
                original_sl = stop_loss
                stop_loss = last_price * 0.98  # Set SL 2% below entry
                logger.warning(f"Invalid stop-loss {original_sl} for LONG ignored. AI suggested SL above entry price {last_price}. Adjusted to {stop_loss}.")
        # --- END: Stop-Loss Guardrail ---

        # Simplified quantity calculation (e.g., trade with 10 USDT)
        qty = round(10 / last_price, 3)

        logger.info(f"Placing a {side} order for {qty} {SYMBOL} at {last_price} with stop_loss {stop_loss}")

        order_response = session.place_order(
            category="linear",
            symbol=SYMBOL,
            side=side,
            orderType="Market",
            qty=str(qty),
            stopLoss=str(stop_loss) if stop_loss else None,
        )
        logger.info(f"Order placement response: {order_response}")

    except Exception as e:
        logger.error(f"Failed to place order: {e}", exc_info=True)


def get_current_position_side(session):
    """Helper to get the side of the current open position."""
    response = session.get_positions(category="linear", symbol=SYMBOL)
    if response['retCode'] == 0 and response['result']['list']:
        for pos in response['result']['list']:
            if pos['symbol'] == SYMBOL and float(pos['size']) > 0:
                return pos['side']
    return None

if __name__ == "__main__":
    main()
