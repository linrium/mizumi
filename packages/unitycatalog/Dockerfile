FROM unitycatalog/unitycatalog:v0.4.0

USER root

# The server uses server/target/classpath (colon-separated, no trailing newline).
# ADD as root so we can write into the read-only directory, then chown.
ADD https://repo1.maven.org/maven2/org/postgresql/postgresql/42.7.4/postgresql-42.7.4.jar \
    /home/unitycatalog/server/target/postgresql-42.7.4.jar

RUN chown unitycatalog:unitycatalog /home/unitycatalog/server/target/postgresql-42.7.4.jar \
    && chmod 550 /home/unitycatalog/server/target/postgresql-42.7.4.jar \
    && printf ':%s' '/home/unitycatalog/server/target/postgresql-42.7.4.jar' \
         >> /home/unitycatalog/server/target/classpath

USER unitycatalog
