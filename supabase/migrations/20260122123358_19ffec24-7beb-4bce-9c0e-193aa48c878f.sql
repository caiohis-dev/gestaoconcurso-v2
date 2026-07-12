-- Create table for managing exclusive edit locks on provas
CREATE TABLE public.prova_edit_locks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prova_id UUID NOT NULL UNIQUE REFERENCES public.provas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  locked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_activity TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.prova_edit_locks ENABLE ROW LEVEL SECURITY;

-- RLS Policies - only allow read access, all writes through functions
CREATE POLICY "Authenticated users can view prova_edit_locks"
ON public.prova_edit_locks
FOR SELECT
USING (true);

CREATE POLICY "No direct insert - use function"
ON public.prova_edit_locks
FOR INSERT
WITH CHECK (false);

CREATE POLICY "No direct update - use function"
ON public.prova_edit_locks
FOR UPDATE
USING (false);

CREATE POLICY "No direct delete - use function"
ON public.prova_edit_locks
FOR DELETE
USING (false);

-- Function to acquire a lock on a prova
CREATE OR REPLACE FUNCTION public.acquire_prova_lock(p_prova_id UUID, p_user_id UUID, p_user_name TEXT)
RETURNS TABLE(success BOOLEAN, locked_by_name TEXT, locked_since TIMESTAMP WITH TIME ZONE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing_lock RECORD;
  v_lock_timeout INTERVAL := '10 minutes';
BEGIN
  -- Check for existing active lock
  SELECT * INTO v_existing_lock
  FROM public.prova_edit_locks
  WHERE prova_id = p_prova_id;
  
  -- If no lock exists, create one
  IF v_existing_lock IS NULL THEN
    INSERT INTO public.prova_edit_locks (prova_id, user_id, user_name, locked_at, last_activity)
    VALUES (p_prova_id, p_user_id, p_user_name, NOW(), NOW());
    
    RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::TIMESTAMP WITH TIME ZONE;
    RETURN;
  END IF;
  
  -- If lock exists but is from the same user, update it
  IF v_existing_lock.user_id = p_user_id THEN
    UPDATE public.prova_edit_locks
    SET last_activity = NOW(), user_name = p_user_name
    WHERE prova_id = p_prova_id;
    
    RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::TIMESTAMP WITH TIME ZONE;
    RETURN;
  END IF;
  
  -- If lock exists but is expired (older than 10 minutes), take it over
  IF v_existing_lock.last_activity < NOW() - v_lock_timeout THEN
    UPDATE public.prova_edit_locks
    SET user_id = p_user_id, user_name = p_user_name, locked_at = NOW(), last_activity = NOW()
    WHERE prova_id = p_prova_id;
    
    RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::TIMESTAMP WITH TIME ZONE;
    RETURN;
  END IF;
  
  -- Lock is active and belongs to another user
  RETURN QUERY SELECT FALSE, v_existing_lock.user_name, v_existing_lock.locked_at;
END;
$$;

-- Function to update lock activity (heartbeat)
CREATE OR REPLACE FUNCTION public.update_prova_lock_activity(p_prova_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.prova_edit_locks
  SET last_activity = NOW()
  WHERE prova_id = p_prova_id AND user_id = p_user_id;
  
  RETURN FOUND;
END;
$$;

-- Function to release a lock
CREATE OR REPLACE FUNCTION public.release_prova_lock(p_prova_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.prova_edit_locks
  WHERE prova_id = p_prova_id AND user_id = p_user_id;
  
  RETURN FOUND;
END;
$$;

-- Function to check current lock status
CREATE OR REPLACE FUNCTION public.check_prova_lock(p_prova_id UUID)
RETURNS TABLE(is_locked BOOLEAN, user_id UUID, user_name TEXT, locked_at TIMESTAMP WITH TIME ZONE, is_expired BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lock RECORD;
  v_lock_timeout INTERVAL := '10 minutes';
BEGIN
  SELECT * INTO v_lock
  FROM public.prova_edit_locks
  WHERE prova_id = p_prova_id;
  
  IF v_lock IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TIMESTAMP WITH TIME ZONE, FALSE;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT 
    TRUE,
    v_lock.user_id,
    v_lock.user_name,
    v_lock.locked_at,
    v_lock.last_activity < NOW() - v_lock_timeout;
END;
$$;