import requests
import json
import logging

logger = logging.getLogger(__name__)

AI_API_URL = "http://localhost:1234/v1/chat/completions"

def get_ai_decision(market_data):
    """
    Gets a trading decision from the local AI model.
    This function contains the flawed logic that needs to be fixed.
    """
    logger.info("Querying AI model for a trading decision...")

    # Simplified prompt based on inferred logic from logs
    prompt = """
    You are a trading analysis AI. Based on the following BTC/USDT market data, provide a trading decision.
    Data: {market_data}
    
    Your analysis must consider technical indicators.
    
    You MUST return ONLY a single JSON object with the following keys:
    - "decision": Must be one of "NEW_LONG", "NEW_SHORT", "HOLD", "CLOSE".
    - "reasoning": A brief explanation.
    - "leverage": A string representing the leverage (e.g., "5").
    - "stop_loss": A float for the stop-loss price, or null.
    """.format(market_data=json.dumps(market_data[:5]))

    headers = {"Content-Type": "application/json"}
    payload = {
        "model": "local-model",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.5,
    }

    try:
        response = requests.post(AI_API_URL, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        
        ai_response_text = response.json()['choices'][0]['message']['content']
        logger.info(f"AI raw response: {ai_response_text}")

        # The ideal response is a single JSON object.
        decision = json.loads(ai_response_text)
        
        logger.info(f"Successfully parsed AI decision: {decision}")
        return decision

    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to connect to AI model at {AI_API_URL}. Is the local server running? Error: {e}")
        return {"decision": "HOLD", "reasoning": "AI model is not reachable."}
    except json.JSONDecodeError as e:
        logger.error(f"Failed to decode JSON from AI response. Error: {e}. Raw response was: {ai_response_text}")
        # Fallback to try and find JSON in the text
        try:
            json_start = ai_response_text.find('{')
            json_end = ai_response_text.rfind('}') + 1
            if json_start != -1:
                json_str = ai_response_text[json_start:json_end]
                decision = json.loads(json_str)
                logger.info(f"Successfully parsed AI decision with fallback: {decision}")
                return decision
            else:
                raise ValueError("No JSON object found in response.")
        except Exception as fallback_e:
            logger.error(f"Fallback JSON parsing also failed. Error: {fallback_e}")
            return {"decision": "HOLD", "reasoning": "Failed to parse AI response."}
    except (ValueError, KeyError) as e:
        logger.error(f"An error occurred processing the AI response. Error: {e}. Raw response: {ai_response_text}")
        return {"decision": "HOLD", "reasoning": "Failed to process AI response."}