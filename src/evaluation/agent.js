const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');
const { buildEvaluationPrompt } = require('./prompts');
const { validateEvaluation, sanitizeEvaluation } = require('./schema');
const logger = require('../utils/logger');

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const MAX_RETRIES = 2;

async function evaluateSession(transcript, scenarioContext) {
  const model = genAI.getGenerativeModel({ model: config.geminiTextModel });
  const prompt = buildEvaluationPrompt(transcript, scenarioContext);

  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        logger.info(`Evaluation retry attempt ${attempt}/${MAX_RETRIES}...`);
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }

      logger.info('Evaluating session transcript...');

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        throw new Error('Evaluation returned no JSON object');
      }
      const jsonStr = text.substring(firstBrace, lastBrace + 1);

      let evaluation;
      try {
        evaluation = JSON.parse(jsonStr);
      } catch (err) {
        throw new Error('Evaluation returned invalid JSON');
      }

      evaluation = sanitizeEvaluation(evaluation);

      const { valid, errors } = validateEvaluation(evaluation);
      if (!valid) {
        throw new Error(`Evaluation validation failed: ${errors.join(', ')}`);
      }

      logger.info(`Evaluation complete: overallScore=${evaluation.overallScore}`);
      return evaluation;
    } catch (err) {
      lastError = err;
      logger.warn(`Evaluation attempt ${attempt + 1} failed: ${err.message}`);
    }
  }

  logger.error('All evaluation attempts failed:', lastError.message);
  throw lastError;
}

module.exports = { evaluateSession };
