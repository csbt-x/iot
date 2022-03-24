#!/bin/bash

# Sets/updates the SSH ingress rules for the ssh-access security group in the specified OUs or Accounts by looking in the
# Parameter Store for all parameters in the path /SSH-Whitelist/* of the caller account the value should be a CIDR.
# All existing SSH ingress assignments in the ssh-access security group will be removed and new ones created for each
# parameter found.
#
# Arguments:
# 1 - OUs comma separated list of OUs to find accounts to apply SSH whitelist to
# 2 - Account Names comma separated to apply SSH whitelist to
# 3 - Account IDs to apply SSH whitelist to
# 4 - AWS_ENABLED indicates if login has already been successfully attempted and not required again

if [[ $BASH_SOURCE = */* ]]; then
 awsDir=${BASH_SOURCE%/*}/
else
  awsDir=./
fi

OUS=$1
ACCOUNT_NAMES=$2
ACCOUNT_IDS=$3

if [ "$AWS_ENABLED" != true ]; then
  AWS_ENABLED=${4,,}
fi

echo "Attempting to set the SSH whitelist for the specified account(s)"

# Optionally login if AWS_ENABLED != 'true'
source "${awsDir}login.sh"

if [ -n "$OUS" ]; then
  ROOT_ID=$(aws organizations list-roots --query "Roots[0].Id" --output text)
  IFS=$','
  for ou in $OUS; do
    OU_ID=$(aws organizations list-organizational-units-for-parent --parent-id $ROOT_ID --query "OrganizationalUnits[?Name=='$ou'].Id" --output text)
    if [ $? -ne 0 ]; then
      echo "Couldn't resolve OU '$ou'"
      exit 1
    fi
    ACCOUNT_IDS=$(aws organizations list-accounts-for-parent --parent-id ou-hbsh-9i66giju --query "Accounts[?Status=='ACTIVE'].Id" --output text)
  done
elif [ -n "$ACCOUNT_NAMES" ]; then
  IFS=$','
  for ACCOUNT_NAME in $ACCOUNT_NAMES; do
    # Get ACCOUNT_ID
    source "${awsDir}get_account_id.sh" &>/dev/null
    if [ $? -ne 0 ]; then
      echo "Couldn't resolve Account name '$ACCOUNT_NAME'"
      exit 1
    fi
    ACCOUNT_IDS="$ACCOUNT_IDS $ACCOUNT_ID"
  done
fi

if [ -z "$ACCOUNT_IDS" ]; then
  echo "Failed to resolve OUs or accounts or no account IDs provided"
  exit 1
fi

SSH_LIST=$(aws ssm get-parameters-by-path --path "/SSH-Whitelist" --query "Parameters[*].[Name,Value]" --output text)
IFS=$' \t'
for ACCOUNT_ID in $ACCOUNT_IDS; do
  # Update github-da profile with ARN for ACCOUNT_ID
  source "${awsDir}set_github-da_account_arn.sh"

  echo "Revoking existing SSH Whitelist for Account '$ACCOUNT_ID'"
  LIST=$(aws ec2 describe-security-groups --profile github-da --filters Name=ip-permission.from-port,Values=22 Name=group-name,Values=ssh-access --query 'SecurityGroups[0].IpPermissions[?(IpProtocol==`tcp` && FromPort==`22`)]' --output json)
  if [ -n "$LIST" ] && [ "$LIST" != "null" ]; then
    aws ec2 revoke-security-group-ingress --profile github-da --group-name ssh-access --ip-permissions "$LIST"
  fi

  if [ -n "$SSH_LIST" ]; then
    IFS=$'\n'
    for entry in $SSH_LIST; do
      IFS=$' \t'
      entryArr=( $entry )
      echo "Adding SSH whitelist for '${entryArr[0]}' '${entryArr[1]}'"
      "$awsDir/ssh_whitelist.sh" "${entryArr[1]}" "github-da"
    done
  fi
done
