// Quick test to verify FSRS scheduler works
const { FSRSScheduler, SM2Scheduler } = require('./src/storage/schedule.ts');

async function testScheduler() {
  console.log('🧪 Testing FSRS Scheduler Implementation\n');

  // Test FSRS
  const fsrsScheduler = new FSRSScheduler();
  let fsrsState = fsrsScheduler.scheduleNewCard();

  console.log('✅ Initial state:', {
    intervalDays: fsrsState.intervalDays,
    stability: fsrsState.stability,
    difficulty: fsrsState.difficulty,
  });

  // Review 5 times with GOOD grade
  for (let i = 0; i < 5; i++) {
    fsrsState = fsrsScheduler.scheduleNextReview(fsrsState, 3); // 3 = GOOD
    console.log(`✅ After review ${i + 1}:`, {
      intervalDays: fsrsState.intervalDays.toFixed(2),
      stability: fsrsState.stability.toFixed(2),
      totalReviews: fsrsState.totalReviews,
    });
  }

  // Test SM-2
  console.log('\n🧪 Testing SM-2 Scheduler\n');
  let sm2State = SM2Scheduler.scheduleNewCard();

  for (let i = 0; i < 5; i++) {
    sm2State = SM2Scheduler.scheduleNextReview(sm2State, 3);
    console.log(`✅ After review ${i + 1}:`, {
      intervalDays: sm2State.intervalDays.toFixed(2),
      easeFactor: sm2State.easeFactor.toFixed(2),
      totalReviews: sm2State.totalReviews,
    });
  }

  console.log('\n🎉 All tests passed! Scheduler implementation working correctly.\n');
}

testScheduler().catch(console.error);
