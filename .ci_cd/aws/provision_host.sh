#!/bin/bash

# Provisions the standard stack of resources using CloudFormation template (cloudformation-create-ec2.yml) in the
# specified AWS member account; if no account specified then the account of the authenticated user will be used.
# The account must already exist and be provisioned in the standard way (see provision_account.sh). To access the
# account the developers-access role in that account will be assumed.
#
# To be called with arguments:
# 1 - ACCOUNT_NAME where resources should be created (defaults to callers account)
# 2 - FQDN for host (e.g. staging.demo.openremote.app)
# 3 - EC2 instance type see cloud formation template parameter
# 4 - WAIT_FOR_STACK if 'false' script will not wait until the cloud formation stack is running

if [[ $BASH_SOURCE = */* ]]; then
 awsDir=${BASH_SOURCE%/*}/
else
  awsDir=./
fi

ACCOUNT_NAME=${1,,}
HOST=${2,,}
INSTANCE_TYPE=${3,,}
WAIT_FOR_STACK=${4,,}

if [ "$AWS_ENABLED" != true ]; then
  AWS_ENABLED=${5,,}
fi

if [ -z "$HOST" ]; then
  echo "Host must be set"
  exit 1
fi

if [ -f "${awsDir}cloudformation-create-ec2.yml" ]; then
  TEMPLATE_PATH="${awsDir}cloudformation-create-ec2.yml"
elif [ -f ".ci_cd/aws/cloudformation-create-ec2.yml" ]; then
  TEMPLATE_PATH=".ci_cd/aws/cloudformation-create-ec2.yml"
elif [ -f "openremote/.ci_cd/aws/cloudformation-create-ec2.yml" ]; then
  TEMPLATE_PATH="openremote/.ci_cd/aws/cloudformation-create-ec2.yml"
else
  echo "Cannot determine location of cloudformation-create-ec2.yml"
  exit 1
fi

# Optionally login if AWS_ENABLED != 'true'
source "${awsDir}login.sh"

ACCOUNT_PROFILE=
if [ -n "$ACCOUNT_NAME" ]; then
  # Update github-da profile with ARN for ACCOUNT_ID
  source "${awsDir}set_github-da_account_arn.sh"
  ACCOUNT_PROFILE="--profile github-da"
fi

STACK_NAME=$(tr '.' '-' <<< "$HOST")

# Check stack doesn't already exist
STATUS=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[?StackId=='$STACK_ID'].StackStatus" --output text $ACCOUNT_PROFILE 2>/dev/null)

if [ -n "$STATUS" ] && [ "$STATUS" != 'DELETE_COMPLETE' ]; then
  echo "Stack already exists for this host '$HOST' current status is '$STATUS'"
  exit 1
fi

#Configure parameters
CALLER_ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
SMTP_ARN="arn:aws:ses:eu-west-1:$CALLER_ACCOUNT_ID:identity/openremote.io"
PARAMS="ParameterKey=Host,ParameterValue=$HOST ParameterKey=SMTPORArn,ParameterValue=$SMTP_ARN"

if [ -n "$INSTANCE_TYPE" ]; then
  PARAMS="$PARAMS ParameterKey=InstanceType,ParameterValue=$INSTANCE_TYPE"
fi

# Determine DNSHostedZoneName and DNSHostedZoneRoleArn (must be set if hosted zone is not in the same account as where the host is being created)
TLD_NAME=$(awk -F. '{print $(NF-1)"."$(NF)}' <<< "$HOST")
COUNT=$(($(awk -F. '{print NF}' <<< "$HOST")-1))
HOSTED_ZONES=$(aws route53 list-hosted-zones --query "HostedZones[?contains(Name, '$TLD_NAME.')].[Name]" --output text $ACCOUNT_PROFILE 2>/dev/null)

if [ -n "$ACCOUNT_PROFILE" ]; then
  # Append caller account hosted zones
  HOSTED_ZONES=$(aws route53 list-hosted-zones --query "HostedZones[?contains(Name, '$TLD_NAME.')].[Name,'true']" --output text 2>/dev/null)
fi

if [ -n "$HOSTED_ZONES" ]; then
  # Match hosted zone with the same name as the host moving up a domain level each time
  i=1
  while [ $i -le $COUNT ]; do

    HOSTED_ZONE=$(cut -d'.' -f$i- <<< "$HOST")

    IFS=$'\n'
    for zone in $HOSTED_ZONES; do
      IFS=$' \t'
      zoneArr=( $zone )
      name=${zoneArr[0]}
      callerAccount=${zoneArr[1]}

      if [ "$name" == "$HOSTED_ZONE." ]; then
        echo "Found hosted zone for this host '$HOSTED_ZONE'"
        DNSHostedZoneName=$HOSTED_ZONE
        if [ "$callerAccount" == 'true' ]; then
          # Get Role ARN that can be assumed to allow DNS record update for this host from the host's account
          DNSHostedZoneRoleArn=$(aws ssm get-parameter --name Hosted-Zone-Access-Role-Arn --query "Parameter.Value" --output text $ACCOUNT_PROFILE)
          if [ -z "$DNSHostedZoneRoleArn" ]; then
            echo "Failed to get 'Hosted-Zone-Access-Role-Arn' from parameter store this must be set for cross account DNS support"
            exit 1
          fi
        fi
      fi
    done

    i=$(($i+1))
  done
fi

if [ -n "$DNSHostedZoneName" ]; then
  PARAMS="$PARAMS ParameterKey=DNSHostedZoneName,ParameterValue=$DNSHostedZoneName"
fi
if [ -n "$DNSHostedZoneRoleArn" ]; then
  PARAMS="$PARAMS ParameterKey=DNSHostedZoneRoleArn,ParameterValue=$DNSHostedZoneRoleArn"
fi

# Create standard stack resources in specified account
STACK_ID=$(aws cloudformation create-stack --capabilities CAPABILITY_NAMED_IAM --stack-name $STACK_NAME --template-body file://$TEMPLATE_PATH --parameters $PARAMS --output text $ACCOUNT_PROFILE)

if [ $? -ne 0 ]; then
  echo "Create stack failed"
else
  echo "Create stack in progress"
fi

if [ "$WAIT_FOR_STACK" != 'false' ]; then
  # Wait for cloud formation stack status to be CREATE_*
  echo "Waiting for stack to be created"
  STATUS=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[?StackId=='$STACK_ID'].StackStatus" --output text $ACCOUNT_PROFILE 2>/dev/null)

  while [[ "$STATUS" == 'CREATE_IN_PROGRESS' ]]; do
    echo "Stack creation is still in progress .. Sleeping 30 seconds"
    sleep 30
    STATUS=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[?StackId=='$STACK_ID'].StackStatus" --output text $ACCOUNT_PROFILE 2>/dev/null)
  done

  if [ "$STATUS" != 'CREATE_COMPLETE' ]; then
    echo "Stack creation has failed status is '$STATUS'"
    exit 1
  else
    echo "Stack creation is complete"
  fi
fi
