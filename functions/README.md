# Snorlax Garage email notifications

This Firebase Function sends transactional email for order payment events:

- A new `receipt` or `balanceReceipt` while the order is `Validating` sends an email to the admin address.
- A new `paymentReview.decision === "approved"` sends an email to the customer.

The function uses SMTP, so it can work with Gmail, Outlook, or a transactional email provider.

## Configure secrets

From the project root, set these Firebase Secret Manager values. Each command prompts securely for the value:

```text
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
EMAIL_FROM
ADMIN_NOTIFICATION_EMAIL
APP_BASE_URL
```

`APP_BASE_URL` is only used to add order links to emails. The function does not put receipt image data into email; the admin can review the receipt inside the protected Orders page.

```text
npx -y firebase-tools@latest functions:secrets:set SMTP_HOST
npx -y firebase-tools@latest functions:secrets:set SMTP_PORT
npx -y firebase-tools@latest functions:secrets:set SMTP_USER
npx -y firebase-tools@latest functions:secrets:set SMTP_PASSWORD
npx -y firebase-tools@latest functions:secrets:set EMAIL_FROM
npx -y firebase-tools@latest functions:secrets:set ADMIN_NOTIFICATION_EMAIL
npx -y firebase-tools@latest functions:secrets:set APP_BASE_URL
```

## Deploy

```text
npx -y firebase-tools@latest deploy --only functions
```

Firebase Functions deployment requires the Firebase project to be on the Blaze billing plan. The email provider may also have its own sending limits or costs.
