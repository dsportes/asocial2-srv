CREATE TABLE `mysafe`.`safe` (
  `id` VARCHAR(64) NOT NULL , 
  `hp0` VARCHAR(64) NOT NULL , 
  `hr0` VARCHAR(64) NOT NULL , 
  `lam` INT NOT NULL , 
  `data` LONGBLOB NOT NULL , 
  PRIMARY KEY (`id`), 
  INDEX `SAFE_hp0` (`hp0`), 
  INDEX `SAFE_hr0` (`hr0`), 
  INDEX `SAFE_lam` (`lam`)) 
  ENGINE = InnoDB; 
  