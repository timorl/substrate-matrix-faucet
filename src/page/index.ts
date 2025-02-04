import { decodeAddress } from '@polkadot/keyring';
import bodyParser from 'body-parser';
import axios from 'axios';
import dotenv from 'dotenv';
import express from 'express';
import { ReCAPTCHA, IVerificationResponse } from "node-grecaptcha-verify";
import type { BalanceResponse, BotRequestType, DripResponse } from 'src/types';

import { checkEnvVariables, getEnvVariable, logger } from '../utils';
import { envVars } from './pageEnvVars';

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static('static'));

checkEnvVariables(envVars);

const port = getEnvVariable('PAGE_PORT', envVars) as string;
const dripAmount = getEnvVariable('DRIP_AMOUNT', envVars) as number;
const cooldown = getEnvVariable('COOLDOWN', envVars) as number;
const baseURL = getEnvVariable('BACKEND_URL', envVars) as string;
const unit = getEnvVariable('NETWORK_UNIT', envVars) as string;

const ax = axios.create({
  baseURL,
  timeout: 10000
});

let lastSuccess = Date.now();

const recaptcha = new ReCAPTCHA(getEnvVariable('GOOGLE_CAPTCHA_PRIVATE', envVars) as string, 0.5);

app.post('/drip', (req, res) => {
  const address = req.body.address;

  recaptcha.verify(req.body['g-recaptcha-response']).then( function (response) {
   let isHuman = response.isHuman;

   if (isHuman) {
     try {
       decodeAddress(address);
     } catch (e) {
       res.status(400).send('Unparsable address.');
       return;
     }

     const attemptTime = Date.now();

     if (attemptTime - cooldown > lastSuccess) {
       ax.post<DripResponse>('/page-endpoint', {
         address,
         amount: dripAmount
       }).then((inner_res) => {
         if (inner_res.data.limitReached) {
           res.status(429).send(`${address} has reached their daily quota. Only request once per day.`);
           return;
         }

         // if hash is null or empty, something went wrong
         if (inner_res.data.hash) {
           res.status(201).send(`{"message": "Sent ${dripAmount} ${unit}s."}`);
           lastSuccess = attemptTime;
         } else {
           res.status(500).send('An unexpected error occured, please contact us and complain');
         }
       }).catch((e) => {
         res.status(500).send('An unexpected error occured, please contact us and complain');
       });
     } else {
       res.status(503).send('Too many faucet requests.');
     }
   } else {
     res.status(401).send('Google captcha failed.');
     return;
   }
  });
});

const main = () => {
  app.listen(port, () => logger.info(`Faucet frontend listening on port ${port}.`));
};

main();

