// Script to push code to GitHub using Octokit
// Uses the GitHub integration for authentication

import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

async function main() {
  const repoName = 'reachinsta';
  
  console.log('Getting GitHub client...');
  const octokit = await getUncachableGitHubClient();
  
  console.log('Getting authenticated user...');
  const { data: user } = await octokit.users.getAuthenticated();
  console.log(`Authenticated as: ${user.login}`);
  
  // Check if repo exists
  let repoExists = false;
  try {
    await octokit.repos.get({
      owner: user.login,
      repo: repoName,
    });
    repoExists = true;
    console.log(`Repository ${repoName} already exists.`);
  } catch (error: any) {
    if (error.status === 404) {
      console.log(`Repository ${repoName} does not exist, creating...`);
    } else {
      throw error;
    }
  }
  
  // Create repo if it doesn't exist
  if (!repoExists) {
    await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      description: 'ReachInsta - Instagram Competitor Intelligence SaaS Platform',
      private: false,
      auto_init: false,
    });
    console.log(`Repository ${repoName} created!`);
  }
  
  // Get access token for git operations
  const accessToken = await getAccessToken();
  
  // Configure git remote
  const remoteUrl = `https://${user.login}:${accessToken}@github.com/${user.login}/${repoName}.git`;
  
  try {
    execSync('git remote remove origin', { stdio: 'pipe' });
  } catch (e) {
    // Remote might not exist
  }
  
  execSync(`git remote add origin ${remoteUrl}`, { stdio: 'inherit' });
  console.log('Git remote configured.');
  
  // Ensure all changes are committed
  try {
    execSync('git add -A', { stdio: 'inherit' });
    execSync('git commit -m "ReachInsta - Instagram Competitor Intelligence Platform" --allow-empty', { stdio: 'inherit' });
  } catch (e) {
    console.log('No new changes to commit.');
  }
  
  // Push to GitHub
  console.log('Pushing to GitHub...');
  execSync('git push -u origin main --force', { stdio: 'inherit' });
  
  console.log(`\nSuccess! Your code is now at: https://github.com/${user.login}/${repoName}`);
}

main().catch(console.error);
