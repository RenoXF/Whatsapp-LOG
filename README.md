# UNFINISH PROJECT


for the database


--
-- Table structure for table `contacts`
--

CREATE TABLE `contacts` (
  `jid` varchar(255) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `notify` varchar(255) DEFAULT NULL,
  `verified_name` varchar(255) DEFAULT NULL,
  `img_url` text,
  `status` text,
  `is_business` tinyint(1) DEFAULT '0',
  `is_enterprise` tinyint(1) DEFAULT '0',
  `verified` tinyint(1) DEFAULT '0',
  `in_phone_book` tinyint(1) DEFAULT '0',
  `known` tinyint(1) DEFAULT '0',
  `profile_pic_url` text,
  `last_seen` timestamp NULL DEFAULT NULL,
  `about` text,
  `short_name` varchar(255) DEFAULT NULL,
  `push_name` varchar(255) DEFAULT NULL,
  `formatted_name` varchar(255) DEFAULT NULL,
  `vname` varchar(255) DEFAULT NULL,
  `labels` json DEFAULT NULL,
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- --------------------------------------------------------

--
-- Table structure for table `group_participants`
--

CREATE TABLE `group_participants` (
  `id` int NOT NULL,
  `group_id` varchar(255) DEFAULT NULL,
  `participant_id` varchar(255) DEFAULT NULL,
  `admin_level` varchar(50) DEFAULT NULL,
  `jid` varchar(255) DEFAULT NULL,
  `joined_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `messages`
--

CREATE TABLE `messages` (
  `id` int NOT NULL,
  `message_id` varchar(255) NOT NULL,
  `sender_name` varchar(255) DEFAULT NULL,
  `sender` varchar(255) NOT NULL,
  `message` text,
  `message_type` varchar(50) DEFAULT NULL,
  `time` timestamp NOT NULL,
  `device` varchar(50) DEFAULT NULL,
  `media_path` varchar(255) DEFAULT NULL,
  `media_caption` text,
  `media_mime_type` varchar(100) DEFAULT NULL,
  `media_size` int DEFAULT NULL,
  `media_duration` int DEFAULT NULL,
  `media_width` int DEFAULT NULL,
  `media_height` int DEFAULT NULL,
  `quoted_message_id` varchar(255) DEFAULT NULL,
  `forwarded` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `from_me` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `message_reactions`
--

CREATE TABLE `message_reactions` (
  `id` int NOT NULL,
  `message_id` varchar(255) NOT NULL,
  `from_jid` varchar(255) NOT NULL,
  `reaction_text` varchar(10) NOT NULL,
  `timestamp` timestamp NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `message_status`
--

CREATE TABLE `message_status` (
  `id` int NOT NULL,
  `message_id` varchar(255) NOT NULL,
  `to_jid` varchar(255) NOT NULL,
  `status` varchar(20) NOT NULL,
  `timestamp` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `whatsapp_groups`
--

CREATE TABLE `whatsapp_groups` (
  `group_id` varchar(255) NOT NULL,
  `group_name` varchar(255) DEFAULT NULL,
  `creation` datetime DEFAULT NULL,
  `owner` varchar(255) DEFAULT NULL,
  `description` text,
  `description_id` varchar(255) DEFAULT NULL,
  `is_restricted` tinyint(1) DEFAULT '0',
  `announce` tinyint(1) DEFAULT '0',
  `ephemeral_duration` int DEFAULT NULL,
  `ephemeral_setting_timestamp` datetime DEFAULT NULL,
  `is_community` tinyint(1) DEFAULT '0',
  `is_parent_group` tinyint(1) DEFAULT '0',
  `parent_group_id` varchar(255) DEFAULT NULL,
  `linked_parent_groups` json DEFAULT NULL,
  `participant_count` int DEFAULT '0',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Indexes for table `contacts`
--
ALTER TABLE `contacts`
  ADD PRIMARY KEY (`jid`),
  ADD KEY `idx_name` (`name`),
  ADD KEY `idx_notify` (`notify`);

--
-- Indexes for table `group_participants`
--
ALTER TABLE `group_participants`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `group_id` (`group_id`,`participant_id`),
  ADD KEY `idx_group_participants` (`group_id`),
  ADD KEY `idx_participant_groups` (`participant_id`);

--
-- Indexes for table `messages`
--
ALTER TABLE `messages`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `message_id` (`message_id`);

--
-- Indexes for table `message_reactions`
--
ALTER TABLE `message_reactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `message_id` (`message_id`);

--
-- Indexes for table `message_status`
--
ALTER TABLE `message_status`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_message_id` (`message_id`),
  ADD KEY `idx_to_jid` (`to_jid`),
  ADD KEY `idx_status` (`status`);

--
-- Indexes for table `whatsapp_groups`
--
ALTER TABLE `whatsapp_groups`
  ADD PRIMARY KEY (`group_id`),
  ADD KEY `idx_group_name` (`group_name`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `group_participants`
--
ALTER TABLE `group_participants`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6527;

--
-- AUTO_INCREMENT for table `messages`
--
ALTER TABLE `messages`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3055;

--
-- AUTO_INCREMENT for table `message_reactions`
--
ALTER TABLE `message_reactions`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT for table `message_status`
--
ALTER TABLE `message_status`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=42;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `group_participants`
--
ALTER TABLE `group_participants`
  ADD CONSTRAINT `group_participants_ibfk_1` FOREIGN KEY (`group_id`) REFERENCES `whatsapp_groups` (`group_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `group_participants_ibfk_2` FOREIGN KEY (`participant_id`) REFERENCES `contacts` (`jid`) ON DELETE SET NULL;

--
-- Constraints for table `message_reactions`
--
ALTER TABLE `message_reactions`
  ADD CONSTRAINT `message_reactions_ibfk_1` FOREIGN KEY (`message_id`) REFERENCES `messages` (`message_id`);

--
-- Constraints for table `message_status`
--
ALTER TABLE `message_status`
  ADD CONSTRAINT `message_status_ibfk_1` FOREIGN KEY (`message_id`) REFERENCES `messages` (`message_id`) ON DELETE CASCADE;
COMMIT;
