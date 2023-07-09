# AWS Glacier: Clear vault
Follow these steps to clear all archives from an AWS glacier vault.
After this is finished, you will be able to delete the vault itself through the browser console.

## Step 1 / Retrieve inventory
This will create a job that collects required information about the vault.
```bash
aws glacier initiate-job --job-parameters '{"Type": "inventory-retrieval"}' --account-id YOUR_ACCOUNT_ID --region YOUR_REGION --vault-name YOUR_VAULT_NAME
```

This can take hours or even days, depending on the size of the vault.
Use the following command to check if it is ready:
```bash
aws glacier list-jobs --account-id YOUR_ACCOUNT_ID --region YOUR_REGION --vault-name YOUR_VAULT_NAME
```

Copy the `JobId` (including the quotes) for the next step.

## (Alternative Step / Set Job Notification)
If you do not want to check your job status continously, you can create a notification to receive a email when your job is finished. [Configuring Vault Notifications Using the AWS Command Line Interface](https://docs.aws.amazon.com/amazonglacier/latest/dev/configuring-notifications-cli.html)

```bash
aws glacier set-vault-notifications --account-id YOUR_ACCOUNT_ID --vault-name YOUR_VAULT_NAME --vault-notification-config ~/notificationconfig.json
```

Or you enable it via the aws console: [Configuring Vault Notifications by Using the S3 Glacier Console](https://docs.aws.amazon.com/amazonglacier/latest/dev/configuring-notifications-console.html)

## Step 2 / Get the ArchivesIds
The following command will result in a file listing all archive IDs, required for `step 3`.
```bash
aws glacier get-job-output --account-id YOUR_ACCOUNT_ID --region YOUR_REGION --vault-name YOUR_VAULT_NAME --job-id YOUR_JOB_ID ./job-output.json
```

## Step 3 / Delete archives
Set the following parameters through environment variables:
```bash
export AWS_ACCOUNT_ID=YOUR_ACCOUNT_ID
export AWS_VAULT_NAME=YOUR_VAULT_NAME
```

And run the script via npx/pnpx:
```bash
npx @chieforz/clear-aws-glacier ./job-output.json

pnpx @chieforz/clear-aws-glacier ./job-output.json
```

All additional parameters will be passed to the aws cli sdk:
[Command line options](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-options.html)

For debugging you can pass --verbose to disable the progress bar.

# Acknowledgement
This tutorial is based on: [https://gist.github.com/Remiii/507f500b5c4e801e4ddc
icon](https://gist.github.com/veuncent/ac21ae8131f24d3971a621fac0d95be5)
