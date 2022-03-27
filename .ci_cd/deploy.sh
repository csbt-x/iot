#!/bin/bash
# -----------------------------------------------------------------------------------------------------
#                    !!!!!!!!! MUST BE RUN FROM THE REPO ROOT DIR !!!!!!!!!
#
# Script that handles packaging deployment files and executing stack down/up via SCP/SSH. Optionally
# supports rollback using ROLLBACK_ON_ERROR='true' but CLEAN_INSTALL must also be 'true' for rollback
# to work.
# -----------------------------------------------------------------------------------------------------

# Function to be called before exiting to remove runner from AWS ssh-access security group
revoke_ssh () {
  if [ "$SSH_GRANTED" == 'true' ]; then
      if [ -n "$CIDR" ]; then
        "temp/aws/ssh_revoke.sh" "$CIDR" "github-da"
      fi
  fi
}

# Load the environment variables into this session
if [ -f "temp/env" ]; then
  echo "Loading environment variables: 'temp/env'"
  set -a
  . ./temp/env
  set +x

  echo "Environment variables loaded:"
  cat temp/env
fi

# Check host is defined
if [ -z "$OR_HOST" ]; then
 echo "Host is not set"
 exit 1
fi
HOST="$OR_HOST"

# Load SSH environment variables into this session
if [ -f "ssh.env" ]; then
  echo "Loading SSH password environment variable: 'ssh.env'"
  set -a
  . ./ssh.env
  set +x
fi

# Copy CI/CD files into temp dir
echo "Copying CI/CD files into temp dir"
if [ "$IS_CUSTOM_PROJECT" == 'true' ]; then
  cp -r openremote/.ci_cd/host_init temp/
  cp -r openremote/.ci_cd/aws temp/
fi
if [ -d ".ci_cd/host_init" ]; then
  cp -r .ci_cd/host_init temp/
fi
if [ -d ".ci_cd/aws" ]; then
  cp -r .ci_cd/aws temp/
fi

chmod +x temp/aws/*
chmod +x temp/host_int/*

# Determine compose file to use and copy to temp dir (do this here as all env variables are loaded)
if [ -z "$ENV_COMPOSE_FILE" ]; then
  if [ -f "profile/$ENVIRONMENT.yml" ]; then
    cp "profile/$ENVIRONMENT.yml" temp/docker-compose.yml
  elif [ -f "docker-compose.yml" ]; then
    cp docker-compose.yml temp/docker-compose.yml
  fi
elif [ -f "$ENV_COMPOSE_FILE" ]; then
  cp "$ENV_COMPOSE_FILE" temp/docker-compose.yml
else
  cp docker-compose.yml temp/docker-compose.yml
fi
# Check docker compose file is present
if [ ! -f "temp/docker-compose.yml" ]; then
  echo "Couldn't determine docker compose file"
  exit 1
fi

# Set SSH/SCP command variables
sshCommandPrefix="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
scpCommandPrefix="scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
if [ -n "$SSH_PORT" ]; then
  sshCommandPrefix="$sshCommandPrefix -p $SSH_PORT"
  scpCommandPrefix="$scpCommandPrefix -P $SSH_PORT"
fi
if [ -f "ssh.key" ]; then
  chmod 400 ssh.key
  sshCommandPrefix="$sshCommandPrefix -i ssh.key"
  scpCommandPrefix="$scpCommandPrefix -i ssh.key"
fi
hostStr="$OR_HOST"
if [ -n "$SSH_USER" ]; then
  hostStr="${SSH_USER}@$hostStr"
fi

# Cannot ping from github runners so commenting this out
# Check host is reachable (ping must be enabled)
#if [ "$SKIP_HOST_PING" != 'true' ]; then
#  echo "Attempting to ping host"
#  ping -c1 -W1 -q $OR_HOST &>/dev/null
#  if [ $? -ne 0 ]; then
#    echo "Host is not reachable by PING"
#    if [ "$SKIP_AWS_EC2_START" != 'true' ] && [ "$AWS_ENABLED" == 'true' ]; then
#      "temp/aws/start_stop_host.sh" "START" "$OR_HOST"
#      if [ $? -ne 0 ]; then
#        # Don't exit as it might just not be reachable by PING we'll fail later on
#        echo "EC2 instance start failed"
#      else
#        echo "EC2 instance start succeeded"
#      fi
#    fi
#  fi
#fi

# Grant SSH access to this runner's public IP on AWS
if [ "$SKIP_SSH_WHITELIST" != 'true' ]; then
  if [ -n "$CIDR" ]; then
    if [ -z "$ACCOUNT_NAME" ] && [ -z "$ACCOUNT_ID" ]; then
      echo "Account ID or name is not set so searching for it"
      source temp/aws/get_account_id_from_host.sh

      if [ -z "$ACCOUNT_ID" ]; then
        echo "Unable to determine account for host '$HOST'"
        exit 1
      fi
    fi

    source temp/aws/set_github-da_account_arn.sh

    echo "Attempting to add runner to AWS SSH whitelist"
    "temp/aws/ssh_whitelist.sh" "$CIDR" "github-da"
    if [ $? -eq 0 ]; then
      SSH_GRANTED=true
    fi
  fi
fi

# Determine host platform via ssh for deployment image building (can't export/import manifests)
PLATFORM=$($sshCommandPrefix $hostStr -- uname -m)
if [ "$?" != 0 -o -z "$PLATFORM" ]; then
  echo "Failed to determine host platform, most likely SSH credentials and/or settings are invalid"
  revoke_ssh
  exit 1
fi
if [ "$PLATFORM" == "x86_64" ]; then
  PLATFORM="amd64"
fi
PLATFORM="linux/$PLATFORM"


# Verify manager tag and create docker image tarballs as required
if [ "$MANAGER_TAG" != '#ref' ]; then
  docker manifest inspect openremote/manager:$MANAGER_TAG > /dev/null 2> /dev/null
  if [ $? -ne 0 ]; then
    echo "Specified manager tag does not exist in docker hub"
    revoke_ssh
    exit 1
  fi
else
  echo "Using commit SHA for manager docker tag: $MANAGER_REF"
  MANAGER_TAG="$MANAGER_REF"
  # Export manager docker image for host platform
  docker build -o type=docker,dest=- --build-arg GIT_REPO=$REPO_NAME --build-arg GIT_COMMIT=$MANAGER_REF --platform $PLATFORM -t openremote/manager:$MANAGER_REF $MANAGER_DOCKER_BUILD_PATH | gzip > temp/manager.tar.gz
  if [ $? -ne 0 ] || [ ! -f temp/manager.tar.gz ]; then
    echo "Failed to export manager image with tag: $MANAGER_REF"
    revoke_ssh
    exit 1
  fi
fi
if [ -n "$DEPLOYMENT_REF" ]; then
  # Export deployment docker image for host platform
  docker build -o type=docker,dest=- --build-arg GIT_REPO=$REPO_NAME --build-arg GIT_COMMIT=$DEPLOYMENT_REF --platform $PLATFORM -t openremote/deployment:$DEPLOYMENT_REF $DEPLOYMENT_DOCKER_BUILD_PATH | gzip > temp/deployment.tar.gz
  if [ $? -ne 0 ] || [ ! -f temp/deployment.tar.gz ]; then
    echo "Failed to export deployment image"
    revoke_ssh
    exit 1
  fi
fi

# Set version variables
MANAGER_VERSION="$MANAGER_TAG"
DEPLOYMENT_VERSION="$DEPLOYMENT_REF"
echo "MANAGER_VERSION=\"$MANAGER_VERSION\"" >> temp/env
echo "DEPLOYMENT_VERSION=\"$DEPLOYMENT_VERSION\"" >> temp/env

echo "GZipping temp dir"
tar -zcvf temp.tar.gz temp

echo "Copying temp dir to host"
$scpCommandPrefix temp.tar.gz ${hostStr}:~

if [ "$ROLLBACK_ON_ERROR" == 'true' ]; then
  if [ "$CLEAN_INSTALL" != 'true' ]; then
    echo "ROLLBACK_ON_ERROR can only be used if CLEAN_INSTALL is set"
    ROLLBACK_ON_ERROR=false
  fi
fi

echo "Running deployment on host"
$sshCommandPrefix ${hostStr} << EOF

if [ "$ROLLBACK_ON_ERROR" == 'true' ]; then
  echo "Moving old temp dir to temp_old"
  mv temp temp_old
  # Tag existing manager image with previous tag (current tag might not be available in docker hub anymore or it could have been overwritten)
  docker tag `docker images openremote/manager -q | head -1` openremote/manager:previous
else
  echo "Removing old temp deployment dir"
  rm -fr temp
fi

echo "Extracting temp dir"
tar -xvzf temp.tar.gz
chmod +x -R temp/

set -a
. ./temp/env
set +a

# Login to AWS if credentials provided
AWS_KEY=$AWS_KEY
AWS_SECRET=$AWS_SECRET
AWS_REGION=$AWS_REGION
source temp/aws/login.sh

if [ -f "temp/manager.tar.gz" ]; then
  echo "Loading manager docker image"
  docker load < temp/manager.tar.gz
fi

if [ -f "temp/deployment.tar.gz" ]; then
  echo "Loading deployment docker image"
  docker load < temp/deployment.tar.gz
fi

# Make sure we have correct keycloak, proxy and postgres images
echo "Pulling requested service versions from docker hub"
docker-compose -p or -f temp/docker-compose.yml pull --ignore-pull-failures

if [ \$? -ne 0 ]; then
  echo "Deployment failed to pull docker images"
  exit 1
fi

# Attempt docker compose down
echo "Stopping existing stack"
docker-compose -f temp/docker-compose.yml -p or down 2> /dev/null

if [ \$? -ne 0 ]; then
  echo "Deployment failed to stop the existing stack"
  exit 1
fi

# Run host init
hostInitCmd=
if [ -n "$HOST_INIT_SCRIPT" ]; then
  if [ ! -f "temp/host_init/${HOST_INIT_SCRIPT}.sh" ]; then
    echo "HOST_INIT_SCRIPT (temp/host_init/${HOST_INIT_SCRIPT}.sh) does not exist"
    exit 1
  fi
  hostInitCmd="temp/host_init/${HOST_INIT_SCRIPT}.sh"
elif [ -f "temp/host_init/init_${ENVIRONMENT}.sh" ]; then
  hostInitCmd="temp/host_init/init_${ENVIRONMENT}.sh"
elif [ -f "temp/host_init/init.sh" ]; then
  hostInitCmd="temp/host_init/init.sh"
fi
if [ -n "\$hostInitCmd" ]; then
  echo "Running host init script: '\$hostInitCmd'"
  sudo \$hostInitCmd
else
  echo "No host init script"
fi

# Delete any deployment volume so we get the latest
echo "Deleting existing deployment data volume"
docker volume rm or_deployment-data 1>/dev/null

# Start the stack
echo "Starting the stack"
docker-compose -f temp/docker-compose.yml -p or up -d

if [ \$? -ne 0 ]; then
  echo "Deployment failed to start the stack"
  exit 1
fi

echo "Waiting for up to 5mins for standard services to be healthy"
count=0
ok=false
while [ \$ok != 'true' ] && [ \$count -lt 60 ]; do
  echo \"attempt...\$count\"
  sleep 5
  postgresOk=false
  keycloakOk=false
  managerOk=false
  proxyOk=false
  if [ -n "\$(docker ps -aq -f health=healthy -f name=or_postgresql_1)" ]; then
    postgresOk=true
  fi
  if [ -n "\$(docker ps -aq -f health=healthy -f name=or_keycloak_1)" ]; then
    keycloakOk=true
  fi
  if [ -n "\$(docker ps -aq -f health=healthy -f name=or_manager_1)" ]; then
    managerOk=true
  fi
  if [ -n "\$(docker ps -aq -f health=healthy -f name=or_proxy_1)" ]; then
    proxyOk=true
  fi

  if [ \$postgresOk == 'true' -a \$keycloakOk == 'true' -a \$managerOk == 'true' -a \$proxyOk == 'true' ]; then
    ok=true
  fi

  count=\$((count+1))
done

if [ \$ok != 'true' ]; then
  echo "Not all containers are healthy"
  exit 1
fi

# Run host post init
hostPostInitCmd=
if [ -f "temp/host_init/post_init_${ENVIRONMENT}.sh" ]; then
  hostPostInitCmd="temp/host_init/post_init_${ENVIRONMENT}.sh"
elif [ -f "temp/host_init/post_init.sh" ]; then
  hostPostInitCmd="temp/host_init/post_init.sh"
fi
if [ -n "$hostPostInitCmd" ]; then
  echo "Running host post init script: '$hostPostInitCmd'"
  sudo $hostPostInitCmd
else
  echo "No host post init script"
fi

# Store deployment snapshot data if the host can access S3 bucket with the same name as the host
docker image inspect $(docker image ls -aq) > temp/image-info.txt
docker inspect $(docker ps -aq) > temp/container-info.txt

aws s3 cp temp/image-info.txt s3://${OR_HOST}/image-info.txt &>/dev/null
aws s3 cp temp/container-info.txt s3://${OR_HOST}/container-info.txt &>/dev/null
EOF

if [ $? -ne 0 ]; then
  echo "Deployment failed or is unhealthy"
  if [ "$ROLLBACK_ON_ERROR" != 'true' ]; then
    revoke_ssh
    exit 1
  else
    DO_ROLLBACK=true
  fi
fi

if [ "$DO_ROLLBACK" == 'true' ]; then
  echo "Attempting rollback"
  $sshCommandPrefix ${hostStr} << EOF

if [ ! -d "temp_old" ]; then
  echo "Previous deployment files not found so cannot rollback"
  exit 1
fi

rm -fr temp
mv temp_old temp

# Set MANAGER_VERSION to previous
echo 'MANAGER_VERSION="previous"' >> temp/env

set -a
. ./temp/env
set +a

if [ -f "temp/deployment.tar.gz" ]; then
  echo "Loading deployment docker image"
  docker load < temp/deployment.tar.gz
fi

# Make sure we have correct keycloak, proxy and postgres images
echo "Pulling requested service versions from docker hub"
docker-compose -p or -f temp/docker-compose.yml pull --ignore-pull-failures

if [ \$? -ne 0 ]; then
  echo "Deployment failed to pull docker images"
  exit 1
fi

# Attempt docker compose down
echo "Stopping existing stack"
docker-compose -f temp/docker-compose.yml -p or down 2> /dev/null

# Run host init
hostInitCmd=
if [ -n "$HOST_INIT_SCRIPT" ]; then
  if [ ! -f "temp/host_init/${HOST_INIT_SCRIPT}.sh" ]; then
    echo "HOST_INIT_SCRIPT (temp/host_init/${HOST_INIT_SCRIPT}.sh) does not exist"
    exit 1
  fi
  hostInitCmd="temp/host_init/${HOST_INIT_SCRIPT}.sh"
elif [ -f "temp/host_init/init_${ENVIRONMENT}.sh" ]; then
  hostInitCmd="temp/host_init/init_${ENVIRONMENT}.sh"
elif [ -f "temp/host_init/init.sh" ]; then
  hostInitCmd="temp/host_init/init.sh"
fi
if [ -n "$hostInitCmd" ]; then
  echo "Running host init script: '$hostInitCmd'"
  sudo $hostInitCmd
else
  echo "No host init script"
fi

# Delete any deployment volume so we get the latest
echo "Deleting existing deployment data volume"
docker volume rm or_deployment-data 1>/dev/null

# Start the stack
echo "Starting the stack"
docker-compose -f temp/docker-compose.yml -p or up -d

if [ \$? -ne 0 ]; then
  echo "Deployment failed to start the stack"
  exit 1
fi

echo "Waiting for up to 5mins for standard services to be healthy"
count=0
ok=false
while [ \$ok != 'true' ] && [ \$count -lt 60 ]; do
  echo \"attempt...\$count\"
  sleep 5
  postgresOk=false
  keycloakOk=false
  managerOk=false
  proxyOk=false
  if [ -n "\$(docker ps -aq -f health=healthy -f name=or_postgresql_1)" ]; then
    postgresOk=true
  fi
  if [ -n "\$(docker ps -aq -f health=healthy -f name=or_keycloak_1)" ]; then
    keycloakOk=true
  fi
  if [ -n "\$(docker ps -aq -f health=healthy -f name=or_manager_1)" ]; then
    managerOk=true
  fi
  if [ -n "\$(docker ps -aq -f health=healthy -f name=or_proxy_1)" ]; then
    proxyOk=true
  fi

  if [ \$postgresOk == 'true' -a \$keycloakOk == 'true' -a \$managerOk == 'true' -a \$proxyOk == 'true' ]; then
    ok=true
  fi

  count=\$((count+1))
done

if [ \$ok != 'true' ]; then
  echo "Not all containers are healthy"
  exit 1
fi

# Run host post init
hostPostInitCmd=
if [ -f "temp/host_init/post_init_${ENVIRONMENT}.sh" ]; then
  hostPostInitCmd="temp/host_init/post_init_${ENVIRONMENT}.sh"
elif [ -f "temp/host_init/post_init.sh" ]; then
  hostPostInitCmd="temp/host_init/post_init.sh"
fi
if [ -n "$hostPostInitCmd" ]; then
  echo "Running host post init script: '$hostPostInitCmd'"
  sudo $hostPostInitCmd
else
  echo "No host post init script"
fi

EOF
fi



echo "Testing manager web server https://$OR_HOST..."
response=$(curl --output /dev/null --silent --head --write-out "%{http_code}" https://$OR_HOST/manager/)
if [ $response -ne 200 ]; then
  echo "Response code = $response"
  revoke_ssh
  exit 1
fi

revoke_ssh
