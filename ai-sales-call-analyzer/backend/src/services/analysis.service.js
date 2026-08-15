const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errorHandler');
const gemini = require('./gemini.service');

async function analyzeCall(callId) {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call) throw new ApiError(404, 'Qo\'ng\'iroq topilmadi.');

  if (!call.recordingUrl) {
    throw new ApiError(400, 'Bu qo\'ng\'iroq uchun audio yozuv mavjud emas.');
  }

  await prisma.call.update({
    where: { id: callId },
    data: { analysisStatus: 'PROCESSING', analysisError: null },
  });

  try {
    const { result, raw } = await gemini.analyzeCallRecording(call.recordingUrl);

    await prisma.$transaction(async (tx) => {
      const analysis = await tx.callAnalysis.create({
        data: {
          callId: call.id,
          overallScore: result.overallScore,
          communication: result.scores.communication,
          needDiscovery: result.scores.needDiscovery,
          productPresentation: result.scores.productPresentation,
          objectionHandling: result.scores.objectionHandling,
          closing: result.scores.closing,
          summary: result.summary,
          customerNeed: result.customerNeed || null,
          customerObjection: result.customerObjection || null,
          customerIntent: result.customerIntent || null,
          strengths: result.strengths,
          transcript: result.transcript,
          rawResponse: raw,
        },
      });

      for (const mistake of result.mistakes) {
        await tx.callMistake.create({
          data: {
            callAnalysisId: analysis.id,
            category: mistake.category,
            severity: mistake.severity,
            description: mistake.description,
            evidence: mistake.evidence,
            whyItIsWrong: mistake.whyItIsWrong,
            recommendation: mistake.recommendation,
            betterPhrase: mistake.betterPhrase,
          },
        });
        await tx.recommendation.create({
          data: {
            callAnalysisId: analysis.id,
            problem: mistake.description,
            whatToDo: mistake.recommendation,
            betterPhrase: mistake.betterPhrase,
          },
        });
      }

      await tx.call.update({
        where: { id: call.id },
        data: { analysisStatus: 'COMPLETED' },
      });
    });

    return prisma.call.findUnique({
      where: { id: call.id },
      include: fullCallInclude(),
    });
  } catch (err) {
    await prisma.call.update({
      where: { id: call.id },
      data: { analysisStatus: 'FAILED', analysisError: err.message },
    });
    throw new ApiError(502, 'Tahlilda xatolik yuz berdi.');
  }
}

function fullCallInclude() {
  return {
    salesperson: true,
    analysis: {
      include: { mistakes: true, recommendations: true },
    },
  };
}

module.exports = { analyzeCall, fullCallInclude };
