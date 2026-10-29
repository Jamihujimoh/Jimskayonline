import { extractExactFailureMessage, validateLineCountClaim, shouldContinueAfterToolLimit } from '../src/ai/flows/admin-agent-flow';
import { verifySecretIdentity } from '../src/lib/secret-identity';

(async () => {
  const exact = await extractExactFailureMessage({ error: 'TypeError: a is not defined', exitCode: 1 });
  if (exact !== 'TypeError: a is not defined') {
    throw new Error(`Expected exact error to be surfaced, got: ${String(exact)}`);
  }

  const lineCheck = await validateLineCountClaim({ userMessage: 'Create a todo app with 1000 lines of code', filePaths: ['src/app/page.tsx', 'src/components/TodoApp.tsx'] });
  if (!lineCheck.shouldVerify) {
    throw new Error('Expected a 1000-line request to trigger verification.');
  }

  const shouldContinue = await shouldContinueAfterToolLimit({ userMessage: 'Create a todo app with 10000 lines of code', toolLimitReached: true, lastToolStatus: 'error' });
  if (!shouldContinue) {
    throw new Error('Expected a large-code request to continue instead of stopping when the tool loop hits its limit.');
  }

  const partial = verifySecretIdentity({ userMessage: 'name = jimoh jamihu adekilekun' });
  if (partial.ok) {
    throw new Error('Creator verification should remain locked until all required identity fields are provided in order.');
  }

  const complete = verifySecretIdentity({
    userMessage: 'name = jimoh jamihu adekilekun; state = osun state; house = dragon house; secrete pin = 201010; password = jidejay201010',
  });
  if (!complete.ok) {
    throw new Error(`Expected full creator verification to pass, got: ${JSON.stringify(complete)}`);
  }

  console.log('admin generation verification: PASS');
})();
