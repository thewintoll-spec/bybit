import pandas as pd
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import argparse

def summarize_pnl(period='daily', target_date_str=None, initial_capital=None):
    """
    Reads P&L data and creates a summary report for the specified period,
    optionally calculating portfolio return based on provided initial capital.
    """
    try:
        df = pd.read_csv("reports/pnl.csv")
        df['updatedTime'] = pd.to_datetime(df['updatedTime'], unit='ms').dt.tz_localize('UTC').dt.tz_convert('Asia/Seoul')

        if target_date_str:
            target_date = datetime.strptime(target_date_str, '%Y-%m-%d').date()
        else:
            target_date = datetime.now(tz=ZoneInfo("Asia/Seoul")).date()

        if period == 'weekly':
            start_date = target_date - timedelta(days=6)
            end_date = target_date
            report_period_str = f"{start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}"
            md_filename = f"reports/pnl_summary_weekly_{end_date.strftime('%Y-%m-%d')}.md"
        elif period == 'monthly':
            start_date = target_date.replace(day=1)
            next_month = start_date.replace(day=28) + timedelta(days=4)
            end_date = next_month - timedelta(days=next_month.day)
            report_period_str = f"{start_date.strftime('%Y-%m')}"
            md_filename = f"reports/pnl_summary_monthly_{report_period_str}.md"
        else: # daily
            start_date = end_date = target_date
            report_period_str = start_date.strftime('%Y-%m-%d')
            md_filename = f"reports/pnl_summary_daily_{report_period_str}.md"
            
        period_trades = df[(df['updatedTime'].dt.date >= start_date) & (df['updatedTime'].dt.date <= end_date)].copy()

        if period_trades.empty:
            print(f"No trades found for the period: {report_period_str}")
            with open(md_filename, 'w', encoding='utf-8') as f:
                f.write(f"# P&L 요약 ({report_period_str})\n\n")
                f.write("해당 기간에 거래 내역이 없습니다.\n")
            print(f"{md_filename} has been created.")
            return

        total_trades = len(period_trades)
        wins = period_trades[period_trades['closedPnl'] > 0]
        losses = period_trades[period_trades['closedPnl'] <= 0]
        
        num_wins = len(wins)
        num_losses = len(losses)
        win_rate = (num_wins / total_trades) * 100 if total_trades > 0 else 0
        total_net_pnl = period_trades['closedPnl'].sum()
        total_cum_entry_value = period_trades['cumEntryValue'].sum()

        avg_profit = wins['closedPnl'].mean() if num_wins > 0 else 0
        avg_loss = losses['closedPnl'].mean() if num_losses > 0 else 0
        
        avg_win_rate = (wins['closedPnl'] / wins['cumEntryValue']).mean() * 100 if num_wins > 0 and wins['cumEntryValue'].sum() > 0 else 0
        avg_loss_rate = (losses['closedPnl'] / losses['cumEntryValue']).mean() * 100 if num_losses > 0 and losses['cumEntryValue'].sum() > 0 else 0
        return_on_volume_rate = (total_net_pnl / total_cum_entry_value) * 100 if total_cum_entry_value > 0 else 0
        
        portfolio_return_rate = None
        if initial_capital is not None and initial_capital > 0:
            portfolio_return_rate = (total_net_pnl / initial_capital) * 100

        summary_df = period_trades[['updatedTime', 'symbol', 'side', 'closedPnl']].copy()
        summary_df.rename(columns={
            'updatedTime': '시간', 'symbol': '심볼', 'side': '포지션', 'closedPnl': '순수익 (USDT)',
        }, inplace=True)
        summary_df['포지션'] = summary_df['포지션'].map({'Sell': 'Long (청산)', 'Buy': 'Short (청산)'}).fillna(summary_df['포지션'])
        summary_df['시간'] = summary_df['시간'].dt.strftime('%Y-%m-%d %H:%M:%S')

        with open(md_filename, 'w', encoding='utf-8') as f:
            f.write(f"# P&L 요약 ({report_period_str})\n\n")
            f.write("## 요약\n")
            f.write(f"- **총 거래:** {total_trades}회\n")
            f.write(f"- **승리:** {num_wins}회 / **패배:** {num_losses}회\n")
            f.write(f"- **승률:** {win_rate:.2f}%\n")
            f.write(f"- **최종 순수익:** **{total_net_pnl:.4f} USDT**\n")
            if portfolio_return_rate is not None:
                f.write(f"- **초기 자본 대비 수익률:** **{portfolio_return_rate:.2f}%**\n")
            f.write("\n### 통계\n")
            f.write(f"- **평균 수익 (익절 시):** {avg_profit:.4f} USDT\n")
            f.write(f"- **평균 손실 (손절 시):** {avg_loss:.4f} USDT\n\n")
            f.write("---\n\n")
            f.write("## 거래 내역\n")
            report_table = summary_df[['시간', '심볼', '포지션', '순수익 (USDT)']]
            f.write(report_table.to_markdown(index=False))

        print(f"P&L summary saved to {md_filename}")

    except FileNotFoundError:
        print("Error: reports/pnl.csv not found. Please run get_pnl.py first.")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a P&L summary for a specific period.")
    parser.add_argument("--period", choices=['daily', 'weekly', 'monthly'], default='daily', help="The reporting period.")
    parser.add_argument("--date", help="The end date for the report, in YYYY-MM-DD format (defaults to today).")
    args = parser.parse_args()

    capital_input = None
    try:
        capital_str = input("초기 자본을 입력하세요 (선택사항, 숫자만 입력): ")
        if capital_str:
            capital_input = float(capital_str)
    except ValueError:
        print("잘못된 입력입니다. 숫자만 입력해주세요.")
        capital_input = None
    
    summarize_pnl(period=args.period, target_date_str=args.date, initial_capital=capital_input)