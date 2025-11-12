--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: chat_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_type text NOT NULL,
    messages jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: form_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_id uuid NOT NULL,
    user_id uuid NOT NULL,
    field_key text NOT NULL,
    field_label text,
    bbox jsonb,
    page integer DEFAULT 1 NOT NULL,
    value text,
    confidence numeric,
    source text DEFAULT 'ai'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: forms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_url text NOT NULL,
    form_name text NOT NULL,
    file_type text,
    file_size integer,
    status text DEFAULT 'uploaded'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    extracted_fields jsonb DEFAULT '[]'::jsonb,
    filled_file_url text,
    layout_hash text,
    CONSTRAINT forms_status_check CHECK ((status = ANY (ARRAY['uploaded'::text, 'processing'::text, 'scanned'::text, 'completed'::text, 'error'::text])))
);


--
-- Name: meal_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meal_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    plan_name text NOT NULL,
    budget numeric(10,2) NOT NULL,
    days integer NOT NULL,
    recipes jsonb DEFAULT '[]'::jsonb,
    grocery_list jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT meal_plans_days_check CHECK ((days > 0))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    category text NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    dismissed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    category text NOT NULL,
    due_date date NOT NULL,
    priority text NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    all_day boolean DEFAULT true,
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))
);


--
-- Name: user_personal_info; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_personal_info (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    field_name text NOT NULL,
    field_value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_sessions chat_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT chat_sessions_pkey PRIMARY KEY (id);


--
-- Name: form_fields form_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_fields
    ADD CONSTRAINT form_fields_pkey PRIMARY KEY (id);


--
-- Name: forms forms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_pkey PRIMARY KEY (id);


--
-- Name: meal_plans meal_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_plans
    ADD CONSTRAINT meal_plans_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: recommendations recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: user_personal_info user_personal_info_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_personal_info
    ADD CONSTRAINT user_personal_info_pkey PRIMARY KEY (id);


--
-- Name: user_personal_info user_personal_info_user_id_field_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_personal_info
    ADD CONSTRAINT user_personal_info_user_id_field_name_key UNIQUE (user_id, field_name);


--
-- Name: idx_form_fields_form_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_fields_form_id ON public.form_fields USING btree (form_id);


--
-- Name: idx_form_fields_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_fields_user_id ON public.form_fields USING btree (user_id);


--
-- Name: chat_sessions update_chat_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_chat_sessions_updated_at BEFORE UPDATE ON public.chat_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: form_fields update_form_fields_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_form_fields_updated_at BEFORE UPDATE ON public.form_fields FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: forms update_forms_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_forms_updated_at BEFORE UPDATE ON public.forms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: meal_plans update_meal_plans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_meal_plans_updated_at BEFORE UPDATE ON public.meal_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: recommendations update_recommendations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_recommendations_updated_at BEFORE UPDATE ON public.recommendations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tasks update_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_personal_info update_user_personal_info_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_personal_info_updated_at BEFORE UPDATE ON public.user_personal_info FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: form_fields form_fields_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_fields
    ADD CONSTRAINT form_fields_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;


--
-- Name: forms forms_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;


--
-- Name: meal_plans meal_plans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_plans
    ADD CONSTRAINT meal_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: recommendations recommendations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;


--
-- Name: tasks tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;


--
-- Name: user_personal_info user_personal_info_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_personal_info
    ADD CONSTRAINT user_personal_info_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chat_sessions Users can create their own chat sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own chat sessions" ON public.chat_sessions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: forms Users can create their own forms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own forms" ON public.forms FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: meal_plans Users can create their own meal plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own meal plans" ON public.meal_plans FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: recommendations Users can create their own recommendations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own recommendations" ON public.recommendations FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: tasks Users can create their own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own tasks" ON public.tasks FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: chat_sessions Users can delete their own chat sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own chat sessions" ON public.chat_sessions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: form_fields Users can delete their own form fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own form fields" ON public.form_fields FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: forms Users can delete their own forms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own forms" ON public.forms FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: meal_plans Users can delete their own meal plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own meal plans" ON public.meal_plans FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_personal_info Users can delete their own personal info; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own personal info" ON public.user_personal_info FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: recommendations Users can delete their own recommendations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own recommendations" ON public.recommendations FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: tasks Users can delete their own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own tasks" ON public.tasks FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: form_fields Users can insert their own form fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own form fields" ON public.form_fields FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_personal_info Users can insert their own personal info; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own personal info" ON public.user_personal_info FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: chat_sessions Users can update their own chat sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own chat sessions" ON public.chat_sessions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: form_fields Users can update their own form fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own form fields" ON public.form_fields FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: forms Users can update their own forms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own forms" ON public.forms FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: meal_plans Users can update their own meal plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own meal plans" ON public.meal_plans FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: user_personal_info Users can update their own personal info; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own personal info" ON public.user_personal_info FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: recommendations Users can update their own recommendations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own recommendations" ON public.recommendations FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: tasks Users can update their own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own tasks" ON public.tasks FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: chat_sessions Users can view their own chat sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own chat sessions" ON public.chat_sessions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: form_fields Users can view their own form fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own form fields" ON public.form_fields FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: forms Users can view their own forms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own forms" ON public.forms FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: meal_plans Users can view their own meal plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own meal plans" ON public.meal_plans FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_personal_info Users can view their own personal info; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own personal info" ON public.user_personal_info FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: recommendations Users can view their own recommendations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own recommendations" ON public.recommendations FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: tasks Users can view their own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own tasks" ON public.tasks FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: chat_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: form_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.form_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: forms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;

--
-- Name: meal_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: recommendations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: user_personal_info; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_personal_info ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


