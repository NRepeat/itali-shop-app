import { googleMerchantSyncQueue } from "../app/service/sync/queues";

async function checkJobs() {
  const waiting = await googleMerchantSyncQueue.getWaiting();
  const active = await googleMerchantSyncQueue.getActive();
  const completed = await googleMerchantSyncQueue.getCompleted();
  const failed = await googleMerchantSyncQueue.getFailed();

  console.log(`Waiting: ${waiting.length}`);
  console.log(`Active: ${active.length}`);
  console.log(`Completed: ${completed.length}`);
  console.log(`Failed: ${failed.length}`);

  if (completed.length > 0) {
    console.log("Last 5 completed jobs:");
    for (const job of completed.slice(-5)) {
        console.log(`Job: ${job.id} (${job.name})`);
    }
  }

  if (failed.length > 0) {
    console.log("Last 5 failed jobs:");
    for (const job of failed.slice(-5)) {
        console.log(`Job: ${job.id} (${job.name}) - ${job.failedReason}`);
    }
  }
  process.exit(0);
}

checkJobs();
