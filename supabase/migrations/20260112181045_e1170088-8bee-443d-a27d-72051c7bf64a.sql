-- Drop the existing policy that doesn't have WITH CHECK
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- Create a proper policy for admins to manage roles with both USING and WITH CHECK
CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));