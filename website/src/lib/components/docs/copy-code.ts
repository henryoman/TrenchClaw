import type { Action } from 'svelte/action';

const setCopiedState = (button: HTMLButtonElement): void => {
  button.textContent = 'Copied';
  window.setTimeout(() => {
    button.textContent = 'Copy';
  }, 1400);
};

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.setAttribute('readonly', '');
    temp.style.position = 'absolute';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();
    const copied = document.execCommand('copy');
    temp.remove();
    return copied;
  }
};

export const copyCodeBlocks: Action<HTMLElement, string> = (node) => {
  let cleanupCallbacks: Array<() => void> = [];

  const clearButtons = (): void => {
    for (const cleanup of cleanupCallbacks) {
      cleanup();
    }

    cleanupCallbacks = [];
    node.querySelectorAll('.code-copy-button').forEach((button) => button.remove());
  };

  const enhance = (): void => {
    clearButtons();

    const blocks = node.querySelectorAll('pre');
    for (const block of Array.from(blocks)) {
      if (!(block instanceof HTMLElement)) {
        continue;
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'code-copy-button';
      button.textContent = 'Copy';
      button.setAttribute('aria-label', 'Copy code block');

      const handleClick = async (): Promise<void> => {
        const codeText = block.querySelector('code')?.textContent ?? block.textContent ?? '';
        if (codeText.length === 0) {
          return;
        }

        const copied = await copyToClipboard(codeText);
        if (copied) {
          setCopiedState(button);
        }
      };

      button.addEventListener('click', handleClick);
      cleanupCallbacks.push(() => button.removeEventListener('click', handleClick));
      block.append(button);
    }
  };

  enhance();

  return {
    update() {
      enhance();
    },
    destroy() {
      clearButtons();
    },
  };
};
