import os
import pandas as pd
from dotenv import load_dotenv
from pybit.unified_trading import HTTP

def get_pnl():
    """
    Fetches closed P&L data from Bybit, saves it to a CSV file,
    and also saves it as a Markdown table.
    """
    load_dotenv()

    api_key = os.getenv("BYBIT_API_KEY")
    api_secret = os.getenv("BYBIT_API_SECRET")

    session = HTTP(
        testnet=False,
        demo=True,
        api_key=api_key,
        api_secret=api_secret,
    )

    try:
        # Fetch closed P&L data
        response = session.get_closed_pnl(category="linear", limit=50)
        pnl_data = response['result']['list']

        if not pnl_data:
            print("No P&L data found.")
            return

        # Convert to pandas DataFrame
        df = pd.DataFrame(pnl_data)

        # Save to CSV
        csv_filename = "reports/pnl.csv"
        df.to_csv(csv_filename, index=False)
        print(f"P&L data saved to {csv_filename}")

        # Save to Markdown
        md_filename = "reports/pnl.md"
        with open(md_filename, 'w') as f:
            f.write(df.to_markdown(index=False))
        print(f"P&L data saved to {md_filename}")

    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    get_pnl()
