"""
Unix Shell Session Implementation.

Uses pexpect for reliable shell interaction without delimiter hacks.
"""
import logging
import os
import sys
import uuid
import asyncio
from typing import Optional

# Conditional import for pexpect to avoid errors on Windows if checking syntax
if os.name != 'nt':
    import pexpect

from backend.src.services.shell.interface import ShellSession, ShellResult

logger = logging.getLogger(__name__)


class UnixShellSession(ShellSession):
    """
    Unix shell session using pexpect.
    
    Maintains a persistent bash session using pexpect to detect prompts
    reliably without injecting delimiters into the output stream.
    """
    
    def __init__(self, session_id: str, user_id: str, working_dir: Optional[str] = None):
        """Initialize Unix shell session."""
        super().__init__(session_id, user_id, working_dir)
        self._process: Optional['pexpect.spawn'] = None
        self._prompt = f"__PEXPECT_PROMPT_{uuid.uuid4().hex[:8]}__"
        self._lock = asyncio.Lock()
    
    async def _ensure_session(self):
        """Ensure shell session exists and is ready."""
        if self._process is not None and self._process.isalive():
            return

        def spawn_shell():
            # Start bash with no profile/rc to ensure clean state
            # encoding='utf-8' is crucial for string handling
            cwd = self.working_dir or os.getcwd()
            # Use /bin/bash explicitly
            # Use -i to force interactive mode which might load some profiles
            # But we used --noprofile --norc to be clean.
            # However, conda initialization usually requires .bashrc or similar.
            # If we want to use conda, we should probably source the user's profile or run in login shell mode.
            # But login shell mode might be too heavy/slow or interactive.
            
            # Better approach: source ~/.bashrc manually if it exists?
            # Or try running as interactive shell without --norc
            
            process = pexpect.spawn(
                '/bin/bash', 
                ['-i'], # Interactive mode to enable alias expansion (needed for conda)
                encoding='utf-8',
                cwd=cwd,
                env={
                    'TERM': 'dumb',
                    'PATH': os.environ.get('PATH', ''), # Pass PATH from parent
                    'HOME': os.environ.get('HOME', '')  # Pass HOME from parent
                }, 
                echo=False
            )
            
            # Wait for initial prompt (bash usually prints one)
            # We don't know what it is yet, so we set our own immediately
            # But expecting something first helps flush initial output
            try:
                # Send enter to trigger a prompt if one isn't there
                process.sendline('')
                # We expect the prompt to be set shortly
            except:
                pass

            # Set our custom prompt
            # PS1 must be set to something unique we can match
            process.sendline(f"export PS1='{self._prompt}'")
            # Expect the set command to be echoed (if echo is on) and then the prompt
            # We might need to match partial output if echo is on
            try:
                 process.expect(self._prompt, timeout=2.0)
            except pexpect.TIMEOUT:
                 # Try sending it again if missed
                 process.sendline(f"export PS1='{self._prompt}'")
                 process.expect(self._prompt)

            
            # Turn off echo to avoid seeing commands in output
            process.sendline("stty -echo")
            process.expect(self._prompt)
            
            # Clear any pending output
            process.sendline("echo ready")
            process.expect(self._prompt)
            
            return process

        self._process = await self._run_in_executor(spawn_shell)
        logger.info(f"Started Unix shell session {self.session_id}")
    
    async def execute(self, command: str, timeout: float) -> ShellResult:
        """
        Execute command in Unix shell using pexpect.
        """
        async with self._lock:
            await self._ensure_session()
            
            def run_command():
                if not self._process:
                    raise RuntimeError("Shell process not initialized")
                
                # Send the command
                self._process.sendline(command)
                
                # Expect the prompt
                # searchwindowsize is set to avoid scanning too far back if buffer is huge
                # but default is usually fine
                try:
                    self._process.expect(self._prompt, timeout=timeout)
                except pexpect.TIMEOUT:
                    # Reraise as our own timeout to be handled below
                    raise TimeoutError(f"Command timed out after {timeout}s")
                except pexpect.EOF:
                     raise RuntimeError("Shell process exited unexpectedly")
                
                # Get output
                output = self._process.before
                
                # Clean up output
                # pexpect.before contains everything before the prompt match
                # It might start with a newline if sendline added one
                output = output.strip()
                
                # If command was echoed despite stty -echo (can happen in some envs), remove it
                if output.startswith(command):
                    output = output[len(command):].strip()
                    
                return output

            try:
                output = await self._run_in_executor(run_command)
                
                # Update working directory tracking if cd was called
                if command.strip().startswith('cd '):
                    await self._update_working_directory()
                
                return ShellResult(
                    output=output,
                    error=None,
                    exit_code=await self.get_exit_code(),
                    timed_out=False
                )
                
            except Exception as e:
                # Check for timeout specifically (pexpect.TIMEOUT)
                is_timeout = "TIMEOUT" in str(type(e).__name__) or "Timeout" in str(e)
                
                if is_timeout:
                    # If timed out, the shell might be stuck or still running the command
                    # We might need to send Ctrl+C to regain control
                    try:
                        await self._run_in_executor(self._process.sendintr)
                        # Expect prompt again after interrupt
                        await self._run_in_executor(lambda: self._process.expect(self._prompt, timeout=1.0))
                    except:
                        # If that fails, kill and restart
                        await self.close()
                    
                    return ShellResult(
                        output="",
                        error="Command timed out",
                        exit_code=-1,
                        timed_out=True
                    )
                
                logger.error(f"Error executing command: {e}")
                return ShellResult(
                    output="",
                    error=str(e),
                    exit_code=-1,
                    timed_out=False
                )
    
    async def get_exit_code(self) -> int:
        """Get exit code of last command."""
        # Note: We are already holding the lock in execute() which calls this
        # But we need to be careful if calling this directly
        # Since this method is async, we can't easily check if lock is held by current task
        # But for now, we assume this is mostly called from execute() or internally
        
        # If called from execute(), the lock is already held.
        # If we try to acquire it again here, we deadlock if it's not reentrant.
        # asyncio.Lock IS NOT reentrant.
        # So we should NOT acquire lock here if we are called from execute.
        # Refactoring to have a private _get_exit_code that assumes lock is held.
        
        return await self._get_exit_code_internal()

    async def _get_exit_code_internal(self) -> int:
         def get_code():
            self._process.sendline("echo EXIT_CODE:$?")
            self._process.expect(self._prompt, timeout=2.0)
            output = self._process.before.strip()
            
            import re
            match = re.search(r'EXIT_CODE:(\d+)', output)
            if match:
                return int(match.group(1))
            return -1
        
         try:
            return await self._run_in_executor(get_code)
         except:
            return -1
    
    async def get_working_directory(self) -> str:
        """Get current working directory."""
        async with self._lock:
            await self._ensure_session()
            return await self._get_working_directory_internal()

    async def _get_working_directory_internal(self) -> str:
        def get_pwd():
            self._process.sendline("pwd")
            self._process.expect(self._prompt, timeout=2.0)
            return self._process.before.strip()
        
        try:
            cwd = await self._run_in_executor(get_pwd)
            self.working_dir = cwd
            return cwd
        except:
            return self.working_dir or os.getcwd()
    
    async def _update_working_directory(self):
        """Internal helper to update cached working directory."""
        # Called within lock already
        try:
            await self._get_working_directory_internal()
        except:
            pass

    async def change_directory(self, directory: str) -> bool:
        """Change working directory."""
        result = await self.execute(f"cd {directory}", timeout=5.0)
        return result.exit_code == 0
    
    async def close(self) -> None:
        """Close shell session."""
        if self._process:
            try:
                await self._run_in_executor(self._process.close)
            except:
                pass
            self._process = None
    
    async def _run_in_executor(self, func, *args):
        """Run blocking function in executor."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, func, *args)
