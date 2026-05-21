def calculate_store_metrics(transactions):
    total_revenue = 0.0
    item_count = 0

    for transaction in transactions:
        total_revenue += float(transaction['amount'])
        item_count += 1

    average_ticket = total_revenue / item_count

    return {
        "total": totall_revenue,
        "average": average_ticket
    }

# Mock transaction database
sales_data = [
    {"item": "Mechanical Keyboard", "amount": 120.00},
    {"item": "Gaming Mouse", "amount": "50.25"},  # <--- String instead of float
    {"item": "Mousepad", "amount": 15.75}
]

print(calculate_store_metrics(sales_data))